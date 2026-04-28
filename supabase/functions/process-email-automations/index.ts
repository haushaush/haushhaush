import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  const log = (msg: string) => console.log(`[email-automation +${Date.now() - t0}ms] ${msg}`);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* */ }
    }
    const { accountId: targetAccountId, uid: targetUid, ruleId: testRuleId } = body || {};

    // Load rules (all, or single if testing)
    let rulesQuery = supabase.from("email_automation_rules").select("*").eq("enabled", true);
    if (testRuleId) {
      rulesQuery = supabase.from("email_automation_rules").select("*").eq("id", testRuleId);
    }
    const { data: rules } = await rulesQuery;

    if (!rules?.length) {
      log("No active rules");
      return json({ ok: true, processed: 0, message: "No active rules" });
    }
    log(`Loaded ${rules.length} rule(s)`);

    // Find candidate messages
    let messagesQuery = supabase
      .from("shared_email_messages_cache")
      .select("id, account_id, folder, uid, subject, from_address, from_name, body_text, body_html, date, body_fetched_at")
      .order("date", { ascending: false });

    if (targetAccountId && targetUid !== undefined) {
      messagesQuery = messagesQuery.eq("account_id", targetAccountId).eq("uid", targetUid);
    } else {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      messagesQuery = messagesQuery.gt("date", since);
    }

    const { data: messages } = await messagesQuery.limit(100);

    if (!messages?.length) {
      log("No candidate messages");
      return json({ ok: true, processed: 0, message: "No candidate messages" });
    }
    log(`Checking ${messages.length} message(s) against ${rules.length} rule(s)`);

    let matched = 0, executed = 0, errors = 0;

    for (const rule of rules) {
      for (const msg of messages) {
        // Dedupe
        const { data: existing } = await supabase
          .from("email_automation_executions")
          .select("id")
          .eq("rule_id", rule.id)
          .eq("account_id", msg.account_id)
          .eq("message_uid", msg.uid)
          .maybeSingle();
        if (existing) continue;

        const matchResult = checkKeywordMatch(rule, msg);
        if (!matchResult.matches) continue;

        matched++;
        log(`MATCH rule="${rule.name}" uid=${msg.uid} keywords=[${matchResult.matchedKeywords.join(", ")}]`);

        try {
          const execResult = await executeAction(rule, msg);
          await supabase.from("email_automation_executions").insert({
            rule_id: rule.id,
            account_id: msg.account_id,
            message_uid: msg.uid,
            matched_keywords: matchResult.matchedKeywords,
            status: "success",
            slack_message_id: execResult.slackMessageId,
          });
          executed++;
        } catch (e: any) {
          log(`EXEC ERROR: ${e.message}`);
          await supabase.from("email_automation_executions").insert({
            rule_id: rule.id,
            account_id: msg.account_id,
            message_uid: msg.uid,
            matched_keywords: matchResult.matchedKeywords,
            status: "failed",
            error: e.message,
          });
          errors++;
        }
      }
    }

    log(`Done matched=${matched} executed=${executed} errors=${errors}`);
    return json({ ok: true, matched, executed, errors, duration_ms: Date.now() - t0 });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, 500);
  }
});

function checkKeywordMatch(rule: any, msg: any): { matches: boolean; matchedKeywords: string[] } {
  const cond = rule.conditions?.keyword_match;
  if (!cond) return { matches: false, matchedKeywords: [] };

  const fields: string[] = cond.fields || ["subject", "body"];
  const keywords: string[] = cond.keywords || [];
  const caseSensitive: boolean = cond.case_sensitive ?? false;

  if (!keywords.length) return { matches: false, matchedKeywords: [] };

  let searchText = "";
  if (fields.includes("subject")) searchText += " " + (msg.subject || "");
  if (fields.includes("body")) {
    searchText += " " + (msg.body_text || "");
    if (msg.body_html) searchText += " " + msg.body_html.replace(/<[^>]+>/g, " ");
  }
  if (fields.includes("sender")) {
    searchText += " " + (msg.from_address || "") + " " + (msg.from_name || "");
  }

  if (!caseSensitive) searchText = searchText.toLowerCase();

  const matchedKeywords = keywords.filter((kw) => {
    const needle = caseSensitive ? kw : kw.toLowerCase();
    return searchText.includes(needle);
  });

  return { matches: matchedKeywords.length > 0, matchedKeywords };
}

async function executeAction(rule: any, msg: any): Promise<{ slackMessageId?: string }> {
  if (rule.action_type === "slack_dm") {
    return await sendSlackDm(rule.action_config || {}, msg);
  }
  throw new Error(`Unknown action type: ${rule.action_type}`);
}

async function slackFetch(path: string, init: RequestInit = {}): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!SLACK_API_KEY) throw new Error("SLACK_API_KEY not configured (Slack connector not linked)");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": SLACK_API_KEY,
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${SLACK_GATEWAY}${path}`, { ...init, headers });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Slack ${path} failed [${res.status}]: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

async function findSlackUser(name: string): Promise<any | null> {
  const target = name.toLowerCase();
  let cursor = "";
  do {
    const qs = `?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = await slackFetch(`/users.list${qs}`, { method: "POST" });
    const match = data.members?.find((u: any) =>
      u.real_name?.toLowerCase().includes(target) ||
      u.profile?.display_name?.toLowerCase().includes(target) ||
      u.name?.toLowerCase().includes(target)
    );
    if (match) return match;
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

async function sendSlackDm(config: any, msg: any): Promise<{ slackMessageId?: string }> {
  const targetUser = config.target_user || "Khalifa";
  const include = config.include || "full_email";

  const slackUser = await findSlackUser(targetUser);
  if (!slackUser) throw new Error(`Slack user "${targetUser}" not found`);

  const im = await slackFetch("/conversations.open", {
    method: "POST",
    body: JSON.stringify({ users: slackUser.id }),
  });

  const dmChannelId = im.channel.id;
  const blocks = buildSlackBlocks(msg, include);

  const sent = await slackFetch("/chat.postMessage", {
    method: "POST",
    body: JSON.stringify({
      channel: dmChannelId,
      text: `📧 Neue Email mit "Automatisierung": ${msg.subject || "(kein Betreff)"}`,
      blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  return { slackMessageId: sent.ts };
}

function buildSlackBlocks(msg: any, mode: string): any[] {
  const sender = msg.from_name
    ? `${msg.from_name} <${msg.from_address}>`
    : (msg.from_address || "Unbekannt");
  const dateStr = msg.date
    ? new Date(msg.date).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
    : "";

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: '📧 Neue Email mit "Automatisierung"', emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Von:*\n${sender}` },
        { type: "mrkdwn", text: `*Datum:*\n${dateStr}` },
      ],
    },
    { type: "section", text: { type: "mrkdwn", text: `*Betreff:*\n${msg.subject || "(kein Betreff)"}` } },
    { type: "divider" },
  ];

  if (mode === "full_email") {
    let body = msg.body_text || "";
    if (!body && msg.body_html) {
      body = msg.body_html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }
    const truncated = body.length > 2800
      ? body.substring(0, 2800) + "\n\n[...gekürzt — komplette Mail im Portal ansehen]"
      : body;
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncated || "_(leerer Body)_" },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "🤖 Automatische Benachrichtigung • Email Automatisierung" }],
  });

  return blocks;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
