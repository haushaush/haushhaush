import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAME_COLUMN_ID = "Col0B5BLYQH7B";
const KAMPAGNEN_STATUS_COLUMN_ID = "Col0B5AR5UJQJ";
const MAX_UPDATES_PER_RUN = 100;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFieldText(fields: any, columnId: string): string | null {
  if (!fields) return null;
  const f = fields[columnId];
  if (f == null) return null;
  if (typeof f === "string") return f;
  if (typeof f === "object") {
    if (typeof f.text === "string" && f.text.trim()) return f.text;
    if (Array.isArray(f.select) && f.select.length > 0) return String(f.select[0]);
    if (typeof f.value === "string") return f.value;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let trigger_source: "cron" | "manual" = "cron";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.trigger_source === "manual") trigger_source = "manual";
  } catch { /* ignore */ }

  try {
    const TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    if (!TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    // 1) accounts
    const { data: clientRows, error: clErr } = await supabase
      .from("clients")
      .select("meta_account_id")
      .not("meta_account_id", "is", null);
    if (clErr) throw clErr;

    const accountIds = [
      ...new Set(
        (clientRows || [])
          .map((c: any) => String(c.meta_account_id || "").replace(/^act_/, "").trim())
          .filter((id: string) => id.length > 0),
      ),
    ];
    console.log(`[check-meta] ${accountIds.length} unique accounts`);

    // 2) option aliases
    const { data: aliases } = await supabase
      .from("slack_list_aliases")
      .select("slack_id, display_name")
      .eq("alias_type", "option");
    const optionMap = new Map<string, string>();
    for (const a of aliases || []) {
      const key = (a.display_name || "").toLowerCase().trim();
      if (key && a.slack_id && !optionMap.has(key)) optionMap.set(key, a.slack_id);
    }
    const AKTIV_OPT_ID = optionMap.get("aktiv");
    const INAKTIV_OPT_ID = optionMap.get("inaktiv");
    if (!AKTIV_OPT_ID || !INAKTIV_OPT_ID) {
      throw new Error("Aliase für Aktiv/Inaktiv fehlen in slack_list_aliases");
    }

    // 3) fetch activities per account (last 60 min)
    const since = Math.floor((Date.now() - 3600 * 1000) / 1000);
    const allEvents: any[] = [];
    for (const accId of accountIds) {
      const url =
        `https://graph.facebook.com/v19.0/act_${accId}/activities` +
        `?fields=event_type,event_time,actor_name,object_name,object_id,extra_data` +
        `&since=${since}&limit=100` +
        `&access_token=${TOKEN}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          console.error(`[acc ${accId}]`, data.error?.message || data.error);
        } else {
          for (const act of data.data || []) {
            if (act.event_type !== "update_campaign_run_status") continue;
            let extra: any = {};
            try {
              extra = act.extra_data ? JSON.parse(act.extra_data) : {};
            } catch { /* ignore */ }
            allEvents.push({
              account_id: accId,
              campaign_id: act.object_id,
              campaign_name: act.object_name || "",
              old_value: extra.old_value,
              new_value: extra.new_value,
              actor_name: act.actor_name,
              event_time: act.event_time ? new Date(act.event_time).toISOString() : null,
            });
          }
        }
      } catch (e) {
        console.error(`[acc ${accId}] fetch failed:`, (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log(`[check-meta] ${allEvents.length} status events`);

    // 4) slack items
    const { data: items } = await supabase
      .from("slack_list_items")
      .select("slack_item_id, slack_list_id, fields");

    // 5) match
    const updates: any[] = [];
    for (const event of allEvents) {
      if (!event.campaign_name) continue;
      const matched = (items || []).filter((item: any) => {
        const slackName = getFieldText(item.fields, NAME_COLUMN_ID);
        if (!slackName || slackName.length < 3) return false;
        const pattern = new RegExp(`\\b${escapeRegex(slackName)}\\b`, "i");
        return pattern.test(event.campaign_name);
      });

      for (const item of matched) {
        const newOptId = event.new_value === "ACTIVE" ? AKTIV_OPT_ID : INAKTIV_OPT_ID;
        const currentOptId = getFieldText(item.fields, KAMPAGNEN_STATUS_COLUMN_ID);
        if (currentOptId === newOptId) continue;
        updates.push({
          slack_item_id: item.slack_item_id,
          slack_list_id: item.slack_list_id,
          new_option_id: newOptId,
          slack_status_before: currentOptId,
          event,
        });
        if (updates.length >= MAX_UPDATES_PER_RUN) break;
      }
      if (updates.length >= MAX_UPDATES_PER_RUN) break;
    }
    console.log(`[check-meta] ${updates.length} updates to send`);

    // 6) dispatch
    let updatesSent = 0;
    let errors = 0;
    for (const upd of updates) {
      try {
        const { data, error } = await supabase.functions.invoke("send-slack-list-update", {
          body: {
            slack_list_id: upd.slack_list_id,
            slack_item_id: upd.slack_item_id,
            field_updates: { [KAMPAGNEN_STATUS_COLUMN_ID]: upd.new_option_id },
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        updatesSent++;
        await supabase.from("meta_campaign_status_log").insert({
          slack_item_id: upd.slack_item_id,
          slack_list_id: upd.slack_list_id,
          meta_account_id: upd.event.account_id,
          meta_campaign_id: upd.event.campaign_id,
          meta_campaign_name: upd.event.campaign_name,
          event_time: upd.event.event_time,
          actor_name: upd.event.actor_name,
          old_value: upd.event.old_value,
          new_value: upd.event.new_value,
          slack_status_before: upd.slack_status_before,
          slack_status_after: upd.new_option_id,
          trigger_source,
          webhook_success: true,
        });
      } catch (e) {
        errors++;
        await supabase.from("meta_campaign_status_log").insert({
          slack_item_id: upd.slack_item_id,
          slack_list_id: upd.slack_list_id,
          meta_account_id: upd.event.account_id,
          meta_campaign_id: upd.event.campaign_id,
          meta_campaign_name: upd.event.campaign_name,
          old_value: upd.event.old_value,
          new_value: upd.event.new_value,
          trigger_source,
          webhook_success: false,
          error_message: (e as Error).message,
        });
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    const duration_ms = Date.now() - startTime;
    await supabase.from("meta_check_runs").insert({
      trigger_source,
      accounts_checked: accountIds.length,
      events_found: allEvents.length,
      items_matched: updates.length,
      updates_sent: updatesSent,
      errors,
      duration_ms,
    });

    return new Response(
      JSON.stringify({
        success: true,
        accounts_checked: accountIds.length,
        events_found: allEvents.length,
        items_matched: updates.length,
        updates_sent: updatesSent,
        errors,
        duration_ms,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const duration_ms = Date.now() - startTime;
    console.error("[check-meta] fatal", e);
    await supabase.from("meta_check_runs").insert({
      trigger_source,
      accounts_checked: 0,
      events_found: 0,
      items_matched: 0,
      updates_sent: 0,
      errors: 1,
      duration_ms,
      error_details: { message: (e as Error).message },
    });
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
