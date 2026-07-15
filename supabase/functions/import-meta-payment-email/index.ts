// import-meta-payment-email
// Nimmt Meta-Zahlungsbeleg-Daten aus n8n/Gmail entgegen und speichert sie
// idempotent in public.meta_payment_receipts.
// Auth: Shared Webhook Secret über Header `x-webhook-secret` ODER
// `authorization: Bearer <SECRET>`. Kein Supabase-JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('META_PAYMENT_WEBHOOK_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!WEBHOOK_SECRET) {
    return json({ error: 'not_configured', message: 'META_PAYMENT_WEBHOOK_SECRET is not set' }, 500);
  }

  // Auth via shared secret
  const headerSecret = req.headers.get('x-webhook-secret');
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const provided = headerSecret || bearer;
  if (!provided || provided !== WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // Accept single object or array
  const items: any[] = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [body];

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

    // Normalize meta_account_id → ensure act_ prefix if numeric available
    let metaAccountId = str(it.meta_account_id);
    const metaAccountNumeric = str(it.meta_account_id_numeric);
    if (!metaAccountId && metaAccountNumeric) metaAccountId = `act_${metaAccountNumeric}`;

    // Check for existing row (transaction_id preferred, gmail_id fallback) so we can
    // preserve any manually curated account assignment on re-import.
    let existing: any = null;
    if (transactionId) {
      const { data } = await admin
        .from('meta_payment_receipts')
        .select('id, meta_account_id, meta_account_id_numeric, account_name')
        .eq('transaction_id', transactionId)
        .maybeSingle();
      existing = data;
    }
    if (!existing && gmailId) {
      const { data } = await admin
        .from('meta_payment_receipts')
        .select('id, meta_account_id, meta_account_id_numeric, account_name')
        .eq('gmail_id', gmailId)
        .maybeSingle();
      existing = data;
    }

    const row: Record<string, unknown> = {
      source: str(it.source) || 'meta_email',
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
      const res = await admin
        .from('meta_payment_receipts')
        .update(row)
        .eq('id', existing.id)
        .select('id')
        .maybeSingle();
      error = res.error;
      id = res.data?.id ?? existing.id;
    } else {
      const res = await admin
        .from('meta_payment_receipts')
        .insert(row)
        .select('id')
        .maybeSingle();
      error = res.error;
      id = res.data?.id;
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
});
