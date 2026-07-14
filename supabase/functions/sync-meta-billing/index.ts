// Sync Meta Ad Account billing snapshots.
// Reuses META_ACCESS_TOKEN and (optional) META_BUSINESS_ID. Never emits token to client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

const TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const BUSINESS_ID = Deno.env.get('META_BUSINESS_ID');
const API = 'https://graph.facebook.com/v19.0';

const FIELDS = [
  'id',
  'account_id',
  'name',
  'account_status',
  'currency',
  'amount_spent',
  'balance',
  'spend_cap',
  'funding_source_details',
  'business_name',
  'business',
  'disable_reason',
  'timezone_name',
].join(',');

async function fetchAllPages(path: string): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = `${API}${path}?fields=${FIELDS}&limit=200&access_token=${TOKEN}`;
  let guard = 0;
  while (url && guard++ < 30) {
    const res = await fetch(url);
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || 'Meta API error');
    if (Array.isArray(data?.data)) out.push(...data.data);
    url = data?.paging?.next || null;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: 'META_ACCESS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Discover all accessible accounts (owned + client + me)
    const errors: any[] = [];
    const acctMap = new Map<string, any>();

    async function addFrom(path: string) {
      try {
        const rows = await fetchAllPages(path);
        for (const a of rows) {
          const id = a.id || (a.account_id ? `act_${a.account_id}` : null);
          if (!id) continue;
          if (!acctMap.has(id)) acctMap.set(id, a);
        }
      } catch (e) {
        errors.push({ path, message: (e as Error).message });
      }
    }

    if (BUSINESS_ID) {
      await addFrom(`/${BUSINESS_ID}/owned_ad_accounts`);
      await addFrom(`/${BUSINESS_ID}/client_ad_accounts`);
    }
    await addFrom('/me/adaccounts');

    let updated = 0;
    let unsupported = 0;
    const rows = [];
    for (const [id, a] of acctMap) {
      // amount_spent from account endpoint is in minor units (cents) for many currencies.
      // We store as returned; UI is aware and divides by 100.
      const spentRaw = a.amount_spent != null ? Number(a.amount_spent) : null;
      const balanceRaw = a.balance != null ? Number(a.balance) : null;
      const capRaw = a.spend_cap != null && a.spend_cap !== '0' ? Number(a.spend_cap) : null;
      if (a.amount_spent == null && a.balance == null) unsupported++;
      rows.push({
        meta_account_id: id,
        account_name: a.name ?? null,
        currency: a.currency ?? null,
        account_status: String(a.account_status ?? ''),
        amount_spent: isFinite(spentRaw as number) ? spentRaw : null,
        balance: isFinite(balanceRaw as number) ? balanceRaw : null,
        spend_cap: isFinite(capRaw as number) ? capRaw : null,
        funding_source_details: a.funding_source_details ?? null,
        business_name: a.business?.name ?? a.business_name ?? null,
        raw: a,
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('meta_billing_account_snapshots')
        .upsert(rows, { onConflict: 'meta_account_id' });
      if (error) errors.push({ path: 'upsert', message: error.message });
      else updated = rows.length;
    }

    return new Response(JSON.stringify({
      success: true,
      accounts_checked: acctMap.size,
      accounts_updated: updated,
      billing_records: 0,
      unsupported_accounts: unsupported,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
