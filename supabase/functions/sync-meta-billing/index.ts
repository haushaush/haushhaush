// Sync Meta Ad Account billing snapshots AND real Business Invoices.
// Reuses META_ACCESS_TOKEN and META_BUSINESS_ID. Never emits token to client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

const TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const BUSINESS_ID = Deno.env.get('META_BUSINESS_ID');
const API = 'https://graph.facebook.com/v19.0';

const ACCOUNT_FIELDS = [
  'id', 'account_id', 'name', 'account_status', 'currency',
  'amount_spent', 'balance', 'spend_cap', 'funding_source_details',
  'business_name', 'business', 'disable_reason', 'timezone_name',
].join(',');

// Fields we try to read from /{business_id}/business_invoices.
// Meta returns only what it actually supports; unsupported field names are silently
// omitted rather than raising, unless we hit an entirely unknown field — so we start
// with the safe documented set and fall back if the API rejects the batch.
const INVOICE_FIELDS_PRIMARY = [
  'id', 'billing_period', 'invoice_date', 'due_date',
  'amount_due', 'currency', 'payment_status', 'type',
  'entity', 'download_uri', 'billed_amount',
].join(',');
const INVOICE_FIELDS_MIN = ['id', 'billing_period', 'invoice_date', 'due_date', 'amount_due', 'currency', 'payment_status'].join(',');

function mapStatus(raw: string | null | undefined): string {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return 'unknown';
  if (['paid', 'settled', 'completed'].includes(s)) return 'paid';
  if (['unpaid', 'open', 'unsettled', 'due'].includes(s)) return 'open';
  if (['failed', 'declined', 'uncollectible', 'error'].includes(s)) return 'failed';
  if (['pending', 'partially_paid', 'partial', 'in_progress', 'processing'].includes(s)) return 'pending';
  if (['canceled', 'cancelled', 'void', 'voided'].includes(s)) return 'canceled';
  return s;
}

// amount_due sometimes returned as { amount, currency, offset } — normalize.
function normalizeAmount(raw: any): { value: number | null; currency: string | null } {
  if (raw == null) return { value: null, currency: null };
  if (typeof raw === 'number') return { value: raw, currency: null };
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    return { value: isFinite(n) ? n : null, currency: null };
  }
  if (typeof raw === 'object') {
    const amt = raw.amount ?? raw.value ?? null;
    const off = raw.offset != null ? Number(raw.offset) : null;
    const cur = raw.currency ?? null;
    if (amt == null) return { value: null, currency: cur };
    const n = typeof amt === 'number' ? amt : parseFloat(String(amt));
    if (!isFinite(n)) return { value: null, currency: cur };
    // Meta often returns amounts in minor units with offset = 2
    const val = off && off > 0 ? n / Math.pow(10, off) : n;
    return { value: val, currency: cur };
  }
  return { value: null, currency: null };
}

async function fetchAllPages(path: string, fields: string): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = `${API}${path}?fields=${fields}&limit=200&access_token=${TOKEN}`;
  let guard = 0;
  while (url && guard++ < 40) {
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

    // ================== 1) Accounts snapshot (unchanged behavior) ==================
    const errors: any[] = [];
    const acctMap = new Map<string, any>();

    async function addFrom(path: string) {
      try {
        const rows = await fetchAllPages(path, ACCOUNT_FIELDS);
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

    let accountsUpdated = 0;
    let unsupported = 0;
    const accountRows: any[] = [];
    for (const [id, a] of acctMap) {
      const spentRaw = a.amount_spent != null ? Number(a.amount_spent) : null;
      const balanceRaw = a.balance != null ? Number(a.balance) : null;
      const capRaw = a.spend_cap != null && a.spend_cap !== '0' ? Number(a.spend_cap) : null;
      if (a.amount_spent == null && a.balance == null) unsupported++;
      accountRows.push({
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

    if (accountRows.length > 0) {
      const { error } = await supabase
        .from('meta_billing_account_snapshots')
        .upsert(accountRows, { onConflict: 'meta_account_id' });
      if (error) errors.push({ path: 'upsert_accounts', message: error.message });
      else accountsUpdated = accountRows.length;
    }

    // Lookup: meta_account_id -> account_name for attribution.
    const accountNameById = new Map<string, string | null>();
    for (const [id, a] of acctMap) accountNameById.set(id, a.name ?? null);

    // ================== 2) Business Invoices (real records) ==================
    let invoicesFetched = 0;
    let invoicesUpserted = 0;
    let invoicesUnattributed = 0;
    let invoicesEndpointState: string = 'not_attempted';
    let invoicesNote: string | null = null;
    let invoicesSupportedFields: string[] = [];

    function sanitize(m: string) {
      let s = String(m || '');
      if (TOKEN) s = s.split(TOKEN).join('[REDACTED]');
      return s;
    }

    if (BUSINESS_ID) {
      const since = new Date();
      since.setMonth(since.getMonth() - 24);
      const startDate = since.toISOString().slice(0, 10);

      // Step A: minimal probe (id only) — determines endpoint state without assuming fields.
      const probeUrl = `${API}/${BUSINESS_ID}/business_invoices?start_date=${startDate}&fields=id&limit=25&access_token=${TOKEN}`;
      const probeRes = await fetch(probeUrl);
      const probeData = await probeRes.json().catch(() => ({}));

      if (!probeRes.ok || probeData?.error) {
        const err = probeData?.error || { message: `HTTP ${probeRes.status}` };
        const code = err.code;
        const msg = String(err.message || '');
        if (code === 200 || code === 10 || err.error_subcode === 2018012) {
          invoicesEndpointState = 'permission_denied';
          invoicesNote = 'Business-Invoices Endpoint erreichbar, aber Token besitzt nicht die erforderlichen Rechte';
        } else if (code === 100 && /nonexist|Unknown/i.test(msg)) {
          invoicesEndpointState = 'endpoint_unavailable';
          invoicesNote = 'Business-Invoices Endpoint für dieses Business nicht verfügbar';
        } else {
          invoicesEndpointState = 'error';
          invoicesNote = sanitize(msg);
        }
        errors.push({ path: 'business_invoices_probe', message: invoicesNote || 'probe failed' });
      } else {
        const sample: any[] = Array.isArray(probeData?.data) ? probeData.data : [];
        if (sample.length === 0) {
          invoicesEndpointState = 'empty';
          invoicesNote = 'Business-Invoices Endpoint verfügbar, aber keine Rechnungen im Zeitraum (24 Monate)';
        } else {
          invoicesEndpointState = 'ok';
          invoicesNote = 'Business-Rechnungen verfügbar';

          // Step B: discover which candidate fields Meta actually returns for this business.
          const CANDIDATE_FIELDS = [
            'id', 'billing_period', 'invoice_date', 'due_date',
            'amount_due', 'billed_amount', 'currency',
            'payment_status', 'type', 'entity', 'download_uri',
          ];
          const firstId = sample[0].id;
          const supported = new Set<string>(['id']);
          const bulkUrl = `${API}/${firstId}?fields=${CANDIDATE_FIELDS.join(',')}&access_token=${TOKEN}`;
          const bulkRes = await fetch(bulkUrl);
          const bulkData = await bulkRes.json().catch(() => ({}));
          if (bulkRes.ok && !bulkData?.error) {
            for (const f of CANDIDATE_FIELDS) if (bulkData[f] !== undefined) supported.add(f);
          } else {
            // Per-field probe fallback.
            for (const f of CANDIDATE_FIELDS) {
              const r = await fetch(`${API}/${firstId}?fields=${f}&access_token=${TOKEN}`);
              const d = await r.json().catch(() => ({}));
              if (r.ok && !d?.error) supported.add(f);
            }
          }
          invoicesSupportedFields = Array.from(supported);
          const fields = invoicesSupportedFields.join(',');

          // Step C: paginate full history using only supported fields.
          const invoices: any[] = [];
          let url: string | null = `${API}/${BUSINESS_ID}/business_invoices?start_date=${startDate}&fields=${fields}&limit=100&access_token=${TOKEN}`;
          let guard = 0;
          while (url && guard++ < 60) {
            const res = await fetch(url);
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.error) {
              errors.push({ path: 'business_invoices_page', message: sanitize(data?.error?.message || `HTTP ${res.status}`) });
              break;
            }
            if (Array.isArray(data?.data)) invoices.push(...data.data);
            url = data?.paging?.next || null;
          }

          invoicesFetched = invoices.length;

          if (invoices.length > 0) {
            const rows: any[] = [];
            for (const inv of invoices) {
              const rawId = inv.id ?? null;
              if (!rawId) continue;

              let attributedAccountId: string | null = null;
              let breakdown: any = null;
              try {
                const campUrl = `${API}/${rawId}/campaigns?fields=ad_account_id,name,amount&limit=200&access_token=${TOKEN}`;
                const campRes = await fetch(campUrl);
                const campData = await campRes.json();
                if (!campData?.error && Array.isArray(campData?.data) && campData.data.length > 0) {
                  breakdown = campData.data;
                  const acctIds = new Set<string>();
                  for (const c of campData.data) {
                    const aid = c.ad_account_id
                      ? (String(c.ad_account_id).startsWith('act_') ? String(c.ad_account_id) : `act_${c.ad_account_id}`)
                      : null;
                    if (aid) acctIds.add(aid);
                  }
                  if (acctIds.size === 1) attributedAccountId = Array.from(acctIds)[0];
                }
              } catch { /* optional */ }

              if (!attributedAccountId) invoicesUnattributed++;

              const amt = normalizeAmount(inv.amount_due ?? inv.billed_amount);
              const currency = inv.currency ?? amt.currency ?? null;
              const billingPeriodStr =
                typeof inv.billing_period === 'string'
                  ? inv.billing_period
                  : inv.billing_period
                    ? `${inv.billing_period.start ?? ''}${inv.billing_period.end ? ` – ${inv.billing_period.end}` : ''}`
                    : null;

              rows.push({
                meta_invoice_id: String(rawId),
                meta_business_id: BUSINESS_ID,
                meta_account_id: attributedAccountId,
                account_name: attributedAccountId ? accountNameById.get(attributedAccountId) ?? null : null,
                billing_period: billingPeriodStr,
                invoice_date: inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : null,
                due_date: inv.due_date ? String(inv.due_date).slice(0, 10) : null,
                amount: amt.value,
                currency,
                status: inv.payment_status ?? null,
                status_mapped: mapStatus(inv.payment_status),
                payment_method: null,
                payment_reference: null,
                document_url: inv.download_uri ?? null,
                entity: typeof inv.entity === 'string' ? inv.entity : inv.entity?.name ?? null,
                account_breakdown: breakdown,
                raw: inv,
                synced_at: new Date().toISOString(),
              });
            }

            for (let i = 0; i < rows.length; i += 200) {
              const chunk = rows.slice(i, i + 200);
              const { error } = await supabase
                .from('meta_billing_invoices')
                .upsert(chunk, { onConflict: 'meta_invoice_id' });
              if (error) errors.push({ path: 'upsert_invoices', message: error.message });
              else invoicesUpserted += chunk.length;
            }
          }
        }
      }
    } else {
      invoicesEndpointState = 'no_business_id';
      invoicesNote = 'Keine Meta Business ID konfiguriert';
    }


    return new Response(JSON.stringify({
      success: true,
      accounts_checked: acctMap.size,
      accounts_updated: accountsUpdated,
      unsupported_accounts: unsupported,
      invoices_endpoint: invoicesEndpointState,
      invoices_fetched: invoicesFetched,
      invoices_upserted: invoicesUpserted,
      invoices_unattributed: invoicesUnattributed,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
