import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KAMPAGNEN_STATUS_COLUMN_ID = "Col0B5AR5UJQJ";

function getFieldText(fields: any, columnId: string): string | null {
  if (!fields) return null;
  const f = fields[columnId];
  if (f == null) return null;
  if (typeof f === "string") return f;
  if (typeof f === "object") {
    if (Array.isArray(f.select) && f.select.length > 0) return String(f.select[0]);
    if (typeof f.text === "string" && f.text.trim()) return f.text;
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
  let slack_item_ids: string[] | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.trigger_source === "manual") trigger_source = "manual";
    if (Array.isArray(body?.slack_item_ids) && body.slack_item_ids.length > 0) {
      slack_item_ids = body.slack_item_ids.map(String);
    }
  } catch { /* ignore */ }

  try {
    const TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    if (!TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    // 1) assignments
    const { data: rawAssignments, error: aErr } = await supabase
      .from("slack_item_meta_account")
      .select("slack_item_id, slack_list_id, meta_account_id, meta_account_name");
    if (aErr) throw aErr;

    const assignments = (rawAssignments || []).filter((a) =>
      slack_item_ids ? slack_item_ids.includes(a.slack_item_id) : true,
    );

    if (assignments.length === 0) {
      const duration_ms = Date.now() - startTime;
      await supabase.from("meta_check_runs").insert({
        trigger_source,
        accounts_checked: 0,
        events_found: 0,
        items_matched: 0,
        updates_sent: 0,
        errors: 0,
        duration_ms,
      });
      return new Response(
        JSON.stringify({
          success: true,
          accounts_checked: 0,
          items_with_assignment: 0,
          events_found: 0,
          items_matched: 0,
          updates_sent: 0,
          errors: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) current statuses
    const itemIds = assignments.map((a) => a.slack_item_id);
    const { data: items } = await supabase
      .from("slack_list_items")
      .select("slack_item_id, fields")
      .in("slack_item_id", itemIds);
    const itemStatusMap = new Map<string, string | null>();
    for (const it of items || []) {
      itemStatusMap.set(it.slack_item_id, getFieldText(it.fields, KAMPAGNEN_STATUS_COLUMN_ID));
    }

    // 3) option aliases
    const { data: aliases } = await supabase
      .from("slack_list_aliases")
      .select("slack_id, display_name")
      .eq("alias_type", "option");
    const optionMap = new Map<string, string>();
    for (const a of aliases || []) {
      const key = (a.display_name || "").toLowerCase().trim();
      if (key && a.slack_id && !optionMap.has(key)) optionMap.set(key, a.slack_id);
    }
    const AKTIV_OPT = optionMap.get("aktiv");
    const INAKTIV_OPT = optionMap.get("inaktiv");
    if (!AKTIV_OPT || !INAKTIV_OPT) {
      throw new Error("Aliase für Aktiv/Inaktiv fehlen in slack_list_aliases");
    }

    // 4) group by account
    const byAccount = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const arr = byAccount.get(a.meta_account_id) || [];
      arr.push(a);
      byAccount.set(a.meta_account_id, arr);
    }

    // 5) per account: latest status-change event
    const since = Math.floor((Date.now() - 3600 * 1000) / 1000);
    const updates: Array<{
      slack_item_id: string;
      slack_list_id: string;
      new_option_id: string;
      meta_account_id: string;
      meta_account_name: string | null;
      latest_event: any;
    }> = [];

    let eventsFound = 0;

    for (const [accountId, accAssignments] of byAccount) {
      const cleanAccountId = String(accountId).replace(/^act_/, "");
      const url =
        `https://graph.facebook.com/v19.0/act_${cleanAccountId}/activities` +
        `?fields=event_type,event_time,actor_name,object_name,object_id,extra_data` +
        `&since=${since}&limit=100&access_token=${TOKEN}`;

      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          console.error(`[Account ${accountId}]`, data.error?.message || data.error);
          continue;
        }
        const statusEvents = (data.data || []).filter(
          (e: any) => e.event_type === "update_campaign_run_status",
        );
        if (statusEvents.length === 0) {
          console.log(`[${accountId}] no status changes in last 60 min`);
          continue;
        }
        eventsFound += statusEvents.length;
        statusEvents.sort(
          (a: any, b: any) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime(),
        );
        const latestEvent = statusEvents[0];
        let extra: any = {};
        try { extra = latestEvent.extra_data ? JSON.parse(latestEvent.extra_data) : {}; } catch { /* */ }
        const newValue = extra.new_value;
        const newOptId = newValue === "ACTIVE" ? AKTIV_OPT : INAKTIV_OPT;

        for (const a of accAssignments) {
          const currentStatus = itemStatusMap.get(a.slack_item_id);
          if (currentStatus === newOptId) {
            console.log(`[skip] ${a.slack_item_id} already ${newValue}`);
            continue;
          }
          updates.push({
            slack_item_id: a.slack_item_id,
            slack_list_id: a.slack_list_id,
            new_option_id: newOptId,
            meta_account_id: a.meta_account_id,
            meta_account_name: a.meta_account_name,
            latest_event: latestEvent,
          });
        }
      } catch (e) {
        console.error(`[${accountId}] fetch failed:`, (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

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

        let extra: any = {};
        try { extra = upd.latest_event.extra_data ? JSON.parse(upd.latest_event.extra_data) : {}; } catch { /* */ }

        await supabase.from("meta_campaign_status_log").insert({
          slack_item_id: upd.slack_item_id,
          slack_list_id: upd.slack_list_id,
          meta_account_id: upd.meta_account_id,
          meta_campaign_id: upd.latest_event.object_id,
          meta_campaign_name: upd.latest_event.object_name,
          event_time: upd.latest_event.event_time
            ? new Date(upd.latest_event.event_time).toISOString()
            : null,
          actor_name: upd.latest_event.actor_name,
          old_value: extra.old_value,
          new_value: extra.new_value,
          slack_status_after: upd.new_option_id,
          trigger_source,
          webhook_success: true,
        });
      } catch (e) {
        errors++;
        console.error("[update failed]", upd.slack_item_id, (e as Error).message);
        await supabase.from("meta_campaign_status_log").insert({
          slack_item_id: upd.slack_item_id,
          slack_list_id: upd.slack_list_id,
          meta_account_id: upd.meta_account_id,
          meta_campaign_id: upd.latest_event?.object_id,
          meta_campaign_name: upd.latest_event?.object_name,
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
      accounts_checked: byAccount.size,
      events_found: eventsFound,
      items_matched: updates.length,
      updates_sent: updatesSent,
      errors,
      duration_ms,
    });

    return new Response(
      JSON.stringify({
        success: true,
        accounts_checked: byAccount.size,
        items_with_assignment: assignments.length,
        events_found: eventsFound,
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
