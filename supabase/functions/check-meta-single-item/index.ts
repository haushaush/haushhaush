import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const KAMPAGNEN_STATUS_COL = 'Col0B5AR5UJQJ';

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

    // 1. Account-Zuweisung
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

    // 2. Meta Campaigns
    const url =
      `https://graph.facebook.com/v19.0/${accountId}/campaigns` +
      `?fields=id,name,status&limit=100&access_token=${TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message}`);
    const campaigns = data.data || [];
    console.log(`[single-check] Account ${accountId}: ${campaigns.length} campaigns`);

    // 3. Snapshot-Diff
    const { data: oldSnapshot } = await supabase
      .from('meta_campaign_snapshot')
      .select('campaign_id, status, campaign_name')
      .eq('account_id', accountId);

    const oldMap = new Map<string, any>();
    for (const old of oldSnapshot || []) oldMap.set(old.campaign_id, old);

    const statusChanges: any[] = [];
    for (const camp of campaigns) {
      const old = oldMap.get(camp.id);
      if (old && old.status !== camp.status) {
        statusChanges.push({
          campaign_id: camp.id,
          campaign_name: camp.name,
          old_status: old.status,
          new_status: camp.status,
        });
      }
      await supabase.from('meta_campaign_snapshot').upsert(
        {
          campaign_id: camp.id,
          campaign_name: camp.name,
          account_id: accountId,
          account_name: assignment.meta_account_name,
          status: camp.status,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'campaign_id' },
      );
    }

    // 4. Last change -> opt id
    let newOptId: string | null = null;
    let triggerEvent: any = null;
    if (statusChanges.length > 0) {
      const lastChange = statusChanges[0];
      const { data: aliases } = await supabase
        .from('slack_list_aliases')
        .select('slack_id, display_name')
        .eq('alias_type', 'option');
      const AKTIV_OPT = aliases?.find((a: any) => (a.display_name || '').toLowerCase() === 'aktiv')?.slack_id;
      const INAKTIV_OPT = aliases?.find((a: any) => (a.display_name || '').toLowerCase() === 'inaktiv')?.slack_id;
      newOptId = lastChange.new_status === 'ACTIVE' ? AKTIV_OPT : INAKTIV_OPT;
      triggerEvent = lastChange;
    }

    // 5. Update senden falls nötig
    let updateSent = false;
    if (newOptId && triggerEvent) {
      const { data: item } = await supabase
        .from('slack_list_items')
        .select('fields')
        .eq('slack_item_id', slack_item_id)
        .maybeSingle();

      const fieldVal: any = (item?.fields as any)?.[KAMPAGNEN_STATUS_COL];
      const currentStatus = Array.isArray(fieldVal?.select) ? fieldVal.select[0] : fieldVal?.value;

      if (currentStatus !== newOptId) {
        try {
          const { error: invokeErr } = await supabase.functions.invoke('send-slack-list-update', {
            body: {
              slack_list_id,
              slack_item_id,
              field_updates: { [KAMPAGNEN_STATUS_COL]: newOptId },
            },
          });
          if (invokeErr) throw new Error(invokeErr.message);
          updateSent = true;

          await supabase.from('meta_campaign_status_log').insert({
            slack_item_id,
            slack_list_id,
            meta_account_id: accountId,
            meta_account_name: assignment.meta_account_name,
            meta_campaign_id: triggerEvent.campaign_id,
            meta_campaign_name: triggerEvent.campaign_name,
            old_value: triggerEvent.old_status,
            new_value: triggerEvent.new_status,
            slack_status_after: newOptId,
            trigger_source: 'manual_single',
            webhook_success: true,
          });
        } catch (e: any) {
          console.error('[update failed]', e.message);
          throw new Error(`Slack-Update fehlgeschlagen: ${e.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        account_id: accountId,
        account_name: assignment.meta_account_name,
        campaigns_checked: campaigns.length,
        status_changes_detected: statusChanges.length,
        update_sent: updateSent,
        duration_ms: Date.now() - startTime,
        details: triggerEvent || null,
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
