// gmail-search-meta-receipts
// Proxy for n8n Gmail search + selective import into meta_payment_receipts.
// Actions:
//   - "search": forwards search criteria to the configured n8n webhook and
//     returns preview results (no DB writes).
//   - "import": receives the selected preview items from the frontend and
//     upserts them into public.meta_payment_receipts using the SAME logic as
//     import-meta-payment-email (transaction_id preferred, gmail_id fallback).
//
// Secrets used (server-only, never exposed to the browser):
//   - N8N_GMAIL_SEARCH_WEBHOOK_URL  n8n webhook that performs the Gmail search
//   - N8N_GMAIL_SEARCH_WEBHOOK_SECRET (optional) shared auth header for n8n
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const N8N_URL = Deno.env.get('N8N_GMAIL_SEARCH_WEBHOOK_URL');
const N8N_SECRET = Deno.env.get('N8N_GMAIL_SEARCH_WEBHOOK_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function toIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  return n === null ? null : Math.round(n);
}
function toIsoOrNull(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Require authenticated app user
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const action = str(body?.action);

  // ── SEARCH ──────────────────────────────────────────────────────────
  if (action === 'search') {
    if (!N8N_URL) {
      return json({
        error: 'not_configured',
        message: 'N8N_GMAIL_SEARCH_WEBHOOK_URL ist nicht gesetzt. Bitte n8n-Webhook konfigurieren.',
      }, 400);
    }
    const criteria = {
      transaction_id: str(body?.transaction_id),
      date_from: str(body?.date_from),
      date_to: str(body?.date_to),
      amount: toNumberOrNull(body?.amount),
      amount_min: toNumberOrNull(body?.amount_min),
      amount_max: toNumberOrNull(body?.amount_max),
      meta_account_id: str(body?.meta_account_id),
      account_name: str(body?.account_name),
      max_results: toIntOrNull(body?.max_results) ?? 25,
    };

    let n8nRes: Response;
    try {
      n8nRes = await fetch(N8N_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(N8N_SECRET ? { 'x-webhook-secret': N8N_SECRET } : {}),
        },
        body: JSON.stringify({ action: 'search', ...criteria }),
      });
    } catch (e) {
      console.error('n8n search fetch failed', e);
      return json({ error: 'n8n_unreachable', message: (e as Error).message }, 502);
    }

    const text = await n8nRes.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

    if (!n8nRes.ok) {
      console.error('n8n search error', n8nRes.status, parsed);
      return json({ error: 'n8n_error', status: n8nRes.status, details: parsed }, n8nRes.status);
    }

    // Normalize response shape → { results: [...] }
    const raw = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.results) ? parsed.results
      : Array.isArray(parsed?.items) ? parsed.items
      : Array.isArray(parsed?.data) ? parsed.data
      : [];

    // Enrich with "already_imported" flag by checking transaction_id / gmail_id
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const txnIds = raw.map((r: any) => str(r.transaction_id)).filter(Boolean) as string[];
    const gmailIds = raw.map((r: any) => str(r.gmail_id)).filter(Boolean) as string[];
    const existingTxn = new Set<string>();
    const existingGm = new Set<string>();
    if (txnIds.length) {
      const { data } = await admin.from('meta_payment_receipts')
        .select('transaction_id').in('transaction_id', txnIds);
      (data || []).forEach((r: any) => r.transaction_id && existingTxn.add(r.transaction_id));
    }
    if (gmailIds.length) {
      const { data } = await admin.from('meta_payment_receipts')
        .select('gmail_id').in('gmail_id', gmailIds);
      (data || []).forEach((r: any) => r.gmail_id && existingGm.add(r.gmail_id));
    }

    const results = raw.map((r: any) => ({
      ...r,
      already_imported:
        (r.transaction_id && existingTxn.has(String(r.transaction_id))) ||
        (r.gmail_id && existingGm.has(String(r.gmail_id))) || false,
    }));

    return json({ ok: true, count: results.length, results });
  }

  // ── IMPORT (selected preview items) ─────────────────────────────────
  if (action === 'import') {
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return json({ error: 'no_items' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const results: any[] = [];

    for (const it of items) {
      if (!it || typeof it !== 'object') {
        results.push({ ok: false, error: 'invalid_item' });
        continue;
      }
      const gmailId = str(it.gmail_id);
      const transactionId = str(it.transaction_id);
      if (!gmailId && !transactionId) {
        results.push({ ok: false, error: 'missing_dedup_key' });
        continue;
      }

      let metaAccountId = str(it.meta_account_id);
      const metaAccountNumeric = str(it.meta_account_id_numeric);
      if (!metaAccountId && metaAccountNumeric) metaAccountId = `act_${metaAccountNumeric}`;

      let existing: any = null;
      if (transactionId) {
        const { data } = await admin.from('meta_payment_receipts')
          .select('id, meta_account_id, meta_account_id_numeric, account_name')
          .eq('transaction_id', transactionId).maybeSingle();
        existing = data;
      }
      if (!existing && gmailId) {
        const { data } = await admin.from('meta_payment_receipts')
          .select('id, meta_account_id, meta_account_id_numeric, account_name')
          .eq('gmail_id', gmailId).maybeSingle();
        existing = data;
      }

      const row: Record<string, unknown> = {
        source: str(it.source) || 'gmail_search',
        document_type: str(it.document_type) || 'payment_receipt',
        account_name: existing?.account_name ?? str(it.account_name),
        meta_account_id: existing?.meta_account_id ?? metaAccountId,
        meta_account_id_numeric: existing?.meta_account_id_numeric ?? metaAccountNumeric,
        transaction_id: transactionId,
        transaction_date: toIsoOrNull(it.transaction_date),
        amount: toNumberOrNull(it.amount),
        currency: str(it.currency),
        payment_status: str(it.payment_status),
        payment_status_label: str(it.payment_status_label),
        period_start_raw: str(it.period_start_raw),
        period_end_raw: str(it.period_end_raw),
        billing_reason: str(it.billing_reason),
        product_type: str(it.product_type),
        payment_method: str(it.payment_method),
        transaction_url: str(it.transaction_url),
        campaigns: Array.isArray(it.campaigns) ? it.campaigns : [],
        campaign_count: toIntOrNull(it.campaign_count) ??
          (Array.isArray(it.campaigns) ? it.campaigns.length : null),
        gmail_id: gmailId,
        gmail_thread_id: str(it.gmail_thread_id),
        email_message_id: str(it.email_message_id),
        email_subject: str(it.email_subject),
        email_received_at: toIsoOrNull(it.email_received_at),
        raw: it,
        updated_at: new Date().toISOString(),
      };

      let error: any = null;
      let id: string | undefined = existing?.id;
      if (existing) {
        const res = await admin.from('meta_payment_receipts')
          .update(row).eq('id', existing.id).select('id').maybeSingle();
        error = res.error; id = res.data?.id ?? existing.id;
      } else {
        const res = await admin.from('meta_payment_receipts')
          .insert(row).select('id').maybeSingle();
        error = res.error; id = res.data?.id;
      }

      if (error) {
        console.error('upsert error', error, { gmailId, transactionId });
        results.push({ ok: false, error: error.message, gmail_id: gmailId, transaction_id: transactionId });
      } else {
        results.push({ ok: true, id, gmail_id: gmailId, transaction_id: transactionId });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    return json({ received: items.length, upserted: ok, failed: items.length - ok, results });
  }

  return json({ error: 'unknown_action', action }, 400);
});
