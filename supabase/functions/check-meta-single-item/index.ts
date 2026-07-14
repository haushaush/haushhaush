import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const KAMPAGNEN_STATUS_COL = 'Col0B645A1WL8';

async function fetchAllCampaigns(accountId: string, token: string) {
  const campaigns: any[] = [];
  let url: string | null =
    `https://graph.facebook.com/v19.0/${accountId}/campaigns` +
    `?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
  let pages = 0;
  while (url && pages < 20) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message}`);
    for (const c of data.data || []) campaigns.push(c);
    url = data.paging?.next || null;
    pages++;
  }
  return campaigns;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  try {
    const { slack_item_id, slack_list_id } = await req.json();
    if (!slack_item_id || !slack_list_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'slack_item_id und slack_list_id erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const TOKEN = Deno.env.get('META_ACCESS_TOKEN');
    if (!TOKEN) throw new Error('META_ACCESS_TOKEN nicht gesetzt');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: assignment } = await supabase
      .from('slack_item_meta_account')
      .select('meta_account_id, meta_account_name')
      .eq('slack_item_id', slack_item_id)
      .maybeSingle();

    if (!assignment) {
      return new Response(
        JSON.stringify({
          success: false,
          reason: 'no_account_assigned',
          message: 'Diesem Item ist kein Meta-Account zugewiesen.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const accountId = assignment.meta_account_id.startsWith('act_')
      ? assignment.meta_account_id
      : `act_${assignment.meta_account_id}`;

    // 1. Alle Kampagnen laden (mit Pagination). Fehler → nie automatisch inaktivieren.
    let campaigns: any[];
    try {
      campaigns = await fetchAllCampaigns(accountId, TOKEN);
    } catch (e: any) {
      throw new Error(`Meta API Fehler – Status bleibt unverändert: ${e.message}`);
    }
    console.log(`[single-check] Account ${accountId}: ${campaigns.length} campaigns`);

    // 2. Snapshot-Diff für Log/Hinweis
    const { data: oldSnapshot } = await supabase
      .from('meta_campaign_snapshot')
      .select('campaign_id, status, campaign_name')
      .eq('account_id', accountId);
    const oldMap = new Map<string, any>();
    for (const old of oldSnapshot || []) oldMap.set(old.campaign_id, old);

    const statusChanges: any[] = [];
    for (const camp of campaigns) {
      const effective = camp.effective_status ?? camp.status;
      const old = oldMap.get(camp.id);
      if (old && old.status !== effective) {
        statusChanges.push({
          campaign_id: camp.id,
          campaign_name: camp.name,
          old_status: old.status,
          new_status: effective,
        });
      }
      await supabase.from('meta_campaign_snapshot').upsert(
        {
          campaign_id: camp.id,
          campaign_name: camp.name,
          account_id: accountId,
          account_name: assignment.meta_account_name,
          status: effective,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'campaign_id' },
      );
    }

    // 3. Zielstatus aus ALLEN Kampagnen (nicht nur der geänderten)
    const activeCampaigns = campaigns.filter((c) => {
      const s = (c.effective_status ?? c.status ?? '').toString().toUpperCase();
      return s === 'ACTIVE';
    });

    let updateSent = false;
    let targetLabel: 'Aktiv' | 'Inaktiv' | null = null;
    let currentLabel: 'Aktiv' | 'Inaktiv' | 'Unbekannt' = 'Unbekannt';

    if (campaigns.length === 0) {
      // Keine Kampagnen sichtbar → nichts inaktivieren
      console.log('[single-check] Keine Kampagnen sichtbar – Slack-Status bleibt unverändert.');
    } else {
      targetLabel = activeCampaigns.length > 0 ? 'Aktiv' : 'Inaktiv';

      const { data: aliases } = await supabase
        .from('slack_list_aliases')
        .select('slack_id, display_name')
        .eq('alias_type', 'option')
        .eq('parent_column_id', KAMPAGNEN_STATUS_COL);
      const AKTIV_OPT = aliases?.find((a: any) => (a.display_name || '').toLowerCase() === 'aktiv')?.slack_id;
      const INAKTIV_OPT = aliases?.find((a: any) => (a.display_name || '').toLowerCase() === 'inaktiv')?.slack_id;
      if (!AKTIV_OPT || !INAKTIV_OPT) {
        throw new Error(`Status-Aliase fehlen: AKTIV=${AKTIV_OPT}, INAKTIV=${INAKTIV_OPT}.`);
      }
      const targetOptId = targetLabel === 'Aktiv' ? AKTIV_OPT : INAKTIV_OPT;

      const { data: item } = await supabase
        .from('slack_list_items')
        .select('fields')
        .eq('slack_item_id', slack_item_id)
        .maybeSingle();
      const fieldVal: any = (item?.fields as any)?.[KAMPAGNEN_STATUS_COL];
      const currentOptId = Array.isArray(fieldVal?.select) ? fieldVal.select[0] : fieldVal?.value;
      currentLabel = currentOptId === AKTIV_OPT ? 'Aktiv' : currentOptId === INAKTIV_OPT ? 'Inaktiv' : 'Unbekannt';

      if (currentOptId !== targetOptId) {
        const { error: invokeErr } = await supabase.functions.invoke('send-slack-list-update', {
          body: {
            slack_list_id,
            slack_item_id,
            field_updates: { [KAMPAGNEN_STATUS_COL]: targetOptId },
          },
        });
        if (invokeErr) throw new Error(`Slack-Update fehlgeschlagen: ${invokeErr.message}`);
        updateSent = true;

        const trigger = statusChanges[0] || {
          campaign_id: null,
          campaign_name: `${activeCampaigns.length}/${campaigns.length} aktiv`,
          old_status: currentLabel,
          new_status: targetLabel,
        };
        await supabase.from('meta_campaign_status_log').insert({
          slack_item_id,
          slack_list_id,
          meta_account_id: accountId,
          meta_account_name: assignment.meta_account_name,
          meta_campaign_id: trigger.campaign_id,
          meta_campaign_name: trigger.campaign_name,
          old_value: trigger.old_status,
          new_value: trigger.new_status,
          slack_status_after: targetOptId,
          trigger_source: 'manual_single',
          webhook_success: true,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        account_id: accountId,
        account_name: assignment.meta_account_name,
        campaigns_checked: campaigns.length,
        active_campaigns: activeCampaigns.length,
        status_changes_detected: statusChanges.length,
        current_slack_status: currentLabel,
        target_slack_status: targetLabel,
        update_sent: updateSent,
        duration_ms: Date.now() - startTime,
        details: statusChanges[0] || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[check-meta-single-item] error', e);
    return new Response(
      JSON.stringify({ success: false, error: e.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
