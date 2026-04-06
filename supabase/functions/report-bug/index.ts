import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
    if (!SLACK_API_KEY) throw new Error("SLACK_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const {
      user_name,
      user_email,
      page_url,
      problem_type,
      description,
      screenshot_url,
      browser_info,
      user_id,
      channel,
    } = await req.json();

    if (!problem_type || !description) {
      return new Response(JSON.stringify({ error: "problem_type and description required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetChannel = channel || "tech-support";

    // Build Lovable-ready prompt
    const lovablePrompt = [
      `Fix the following ${problem_type} reported by a user:`,
      "",
      `**Page:** ${page_url || "unknown"}`,
      `**Problem:** ${description}`,
      "",
      `Reported by: ${user_name || "Unknown"} (${user_email || "no email"})`,
      `Browser: ${browser_info || "unknown"}`,
      screenshot_url ? `Screenshot: ${screenshot_url}` : "",
    ].filter(Boolean).join("\n");

    // Build Slack blocks
    const typeEmoji: Record<string, string> = {
      Bug: "🐛",
      Darstellungsfehler: "🎨",
      "Funktion fehlt": "➕",
      "Falscher Text": "✏️",
      Sonstiges: "📝",
    };

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `${typeEmoji[problem_type] || "🐛"} Bug Report: ${problem_type}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Gemeldet von:*\n${user_name || "Unbekannt"}` },
          { type: "mrkdwn", text: `*Seite:*\n\`${page_url || "/"}\`` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Beschreibung:*\n${description.slice(0, 500)}` },
      },
    ];

    if (screenshot_url) {
      blocks.push({
        type: "image" as any,
        image_url: screenshot_url,
        alt_text: "Screenshot",
      } as any);
    }

    // Lovable prompt block
    blocks.push(
      { type: "divider" } as any,
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📋 Lovable Prompt (copy & paste):*\n\`\`\`${lovablePrompt.slice(0, 2500)}\`\`\``,
        },
      } as any,
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Browser: ${(browser_info || "").slice(0, 100)} · ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}` },
        ],
      } as any
    );

    // Send to Slack
    const slackResp = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: targetChannel,
        text: `🐛 Bug Report: ${problem_type} — ${description.slice(0, 100)}`,
        blocks,
        username: "Bug Reporter",
        icon_emoji: ":bug:",
      }),
    });

    const slackData = await slackResp.json();

    if (!slackData.ok) {
      console.error("Slack error:", slackData.error);
    }

    // Save to database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("bug_reports").insert({
      user_id: user_id || null,
      user_name,
      user_email,
      page_url,
      problem_type,
      description,
      screenshot_url: screenshot_url || null,
      browser_info,
      slack_message_ts: slackData.ts || null,
    });

    return new Response(
      JSON.stringify({ success: true, slack_ok: slackData.ok }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("report-bug error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
