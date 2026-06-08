import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const KAMPAGNEN_STATUS_COL = "Col0B645A1WL8";

serve(async (req) => {
  // PREFLIGHT must be checked FIRST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let trigger_source: "cron" | "manual" = "cron";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.trigger_source === "manual") trigger_source = "manual";
  } catch { /* */ }

  try {
    const TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    if (!TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    // 1) All accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&limit=200&access_token=${TOKEN}`,
    );
    const accountsData = await accountsRes.json();
    if (accountsData.error) throw new Error(accountsData.error.message);
    const accounts = accountsData.data || [];
    console.log(`[check] Found ${accounts.length} accounts`);

    // 2) All campaigns per account
    const allCampaigns: Array<{
      campaign_id: string;
      campaign_name: string;
      account_id: string;
      account_name: string;
      status: string;
      daily_budget: number | null;
    }> = [];

    for (const acc of accounts) {
      try {
        const url =
          `https://graph.facebook.com/v19.0/${acc.id}/campaigns` +
          `?fields=id,name,status,daily_budget,lifetime_budget&limit=100` +
          `&access_token=${TOKEN}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          console.error(`[${acc.id}]`, data.error.message);
          continue;
        }
        for (const camp of (data.data || [])) {
          allCampaigns.push({
            campaign_id: camp.id,
            campaign_name: camp.name,
            account_id: acc.id,
            account_name: acc.name,
            status: camp.status,
            daily_budget: camp.daily_budget ? parseInt(camp.daily_budget) : null,
          });
        }
      } catch (e) {
        console.error(`[${acc.id}] fetch failed:`, (e as Error).message);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`[check] Found ${allCampaigns.length} campaigns total`);

    // 3) Existing snapshot
    const { data: oldSnapshot } = await supabase
      .from("meta_campaign_snapshot")
      .select("*");
    const oldMap = new Map<string, any>();
    for (const old of (oldSnapshot || [])) oldMap.set(old.campaign_id, old);

    // 4) Detect changes
    const isFirstRun = oldMap.size === 0;
    const changes: any[] = [];
    for (const camp of allCampaigns) {
      const old = oldMap.get(camp.campaign_id);
      if (!old) {
        if (!isFirstRun) changes.push({ type: "NEW", ...camp });
        continue;
      }
      if (camp.status !== old.status || camp.campaign_name !== old.campaign_name) {
        changes.push({
          type: "UPDATED",
          ...camp,
          old_status: old.status,
          new_status: camp.status,
          old_name: old.campaign_name,
          new_name: camp.campaign_name,
        });
      }
    }
    console.log(`[check] ${changes.length} changes detected (first_run=${isFirstRun})`);

    // 5) Upsert snapshot
    if (allCampaigns.length > 0) {
      const nowIso = new Date().toISOString();
      const rows = allCampaigns.map((c) => ({ ...c, last_seen_at: nowIso }));
      // chunk upserts to avoid payload limits
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("meta_campaign_snapshot")
          .upsert(chunk, { onConflict: "campaign_id" });
        if (error) console.error("[snapshot upsert]", error.message);
      }
    }

    // 6) Cleanup deleted
    const currentIds = new Set(allCampaigns.map((c) => c.campaign_id));
    const deletedIds = [...oldMap.keys()].filter((id) => !currentIds.has(id));
    if (deletedIds.length > 0) {
      await supabase
        .from("meta_campaign_snapshot")
        .delete()
        .in("campaign_id", deletedIds);
    }

    // 7) Slack-Item Account assignments
    const { data: assignments } = await supabase
      .from("slack_item_meta_account")
      .select("slack_item_id, slack_list_id, meta_account_id");

    const accountToSlackItems = new Map<string, Array<{ slack_item_id: string; slack_list_id: string }>>();
    for (const a of (assignments || [])) {
      const accId = a.meta_account_id.startsWith("act_")
        ? a.meta_account_id
        : `act_${a.meta_account_id}`;
      const arr = accountToSlackItems.get(accId) || [];
      arr.push({ slack_item_id: a.slack_item_id, slack_list_id: a.slack_list_id });
      accountToSlackItems.set(accId, arr);
    }

    // 8) Filter status changes
    const statusChanges = changes.filter(
      (c) => c.type === "UPDATED" && c.old_status !== c.new_status,
    );
    console.log(`[check] ${statusChanges.length} status changes`);

    // 9) Group by account
    const byAccount = new Map<string, any[]>();
    for (const change of statusChanges) {
      const arr = byAccount.get(change.account_id) || [];
      arr.push(change);
      byAccount.set(change.account_id, arr);
    }

    // 10) Option aliases
    const { data: aliases } = await supabase
      .from("slack_list_aliases")
      .select("slack_id, display_name, parent_column_id")
      .eq("alias_type", "option")
      .eq("parent_column_id", KAMPAGNEN_STATUS_COL);
    const AKTIV_OPT = aliases?.find((a: any) => (a.display_name || "").toLowerCase() === "aktiv")?.slack_id;
    const INAKTIV_OPT = aliases?.find((a: any) => (a.display_name || "").toLowerCase() === "inaktiv")?.slack_id;
    console.log('[option-mapping]', {
      AKTIV_OPT,
      INAKTIV_OPT,
      total_options_found: aliases?.length,
    });

    let updatesSent = 0;
    let errors = 0;

    if (byAccount.size > 0 && (!AKTIV_OPT || !INAKTIV_OPT)) {
      throw new Error(
        `Kampagnen-Status-Aliase fehlen: AKTIV=${AKTIV_OPT}, INAKTIV=${INAKTIV_OPT}. ` +
        `Bitte in slack_list_aliases anlegen für column ${KAMPAGNEN_STATUS_COL}.`
      );
    }

    for (const [accountId, accChanges] of byAccount) {
      const slackItems = accountToSlackItems.get(accountId);
      if (!slackItems || slackItems.length === 0) continue;

      const lastChange = accChanges[accChanges.length - 1];
      const newOptId = lastChange.new_status === "ACTIVE" ? AKTIV_OPT! : INAKTIV_OPT!;

      for (const item of slackItems) {
        try {
          const { data, error } = await supabase.functions.invoke("send-slack-list-update", {
            body: {
              slack_list_id: item.slack_list_id,
              slack_item_id: item.slack_item_id,
              field_updates: { [KAMPAGNEN_STATUS_COL]: newOptId },
            },
          });
          if (error) throw error;
          if ((data as any)?.error) throw new Error((data as any).error);
          updatesSent++;

          await supabase.from("meta_campaign_status_log").insert({
            slack_item_id: item.slack_item_id,
            slack_list_id: item.slack_list_id,
            meta_account_id: accountId,
            meta_campaign_id: lastChange.campaign_id,
            meta_campaign_name: lastChange.campaign_name,
            old_value: lastChange.old_status,
            new_value: lastChange.new_status,
            slack_status_after: newOptId,
            trigger_source,
            webhook_success: true,
          });
        } catch (e) {
          errors++;
          console.error("[update failed]", item.slack_item_id, (e as Error).message);
          await supabase.from("meta_campaign_status_log").insert({
            slack_item_id: item.slack_item_id,
            slack_list_id: item.slack_list_id,
            meta_account_id: accountId,
            meta_campaign_id: lastChange.campaign_id,
            meta_campaign_name: lastChange.campaign_name,
            old_value: lastChange.old_status,
            new_value: lastChange.new_status,
            trigger_source,
            webhook_success: false,
            error_message: (e as Error).message,
          });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const duration_ms = Date.now() - startTime;
    await supabase.from("meta_check_runs").insert({
      trigger_source,
      accounts_checked: accounts.length,
      events_found: statusChanges.length,
      items_matched: statusChanges.length,
      updates_sent: updatesSent,
      errors,
      duration_ms,
    });

    return new Response(
      JSON.stringify({
        success: true,
        accounts_checked: accounts.length,
        campaigns_checked: allCampaigns.length,
        changes_detected: changes.length,
        status_changes: statusChanges.length,
        updates_sent: updatesSent,
        errors,
        is_first_run: isFirstRun,
        duration_ms,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
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
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
