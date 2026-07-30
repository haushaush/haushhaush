// get-meta-reporting-settings
// Server-side endpoint for n8n: returns the reporting settings for a batch of
// Meta ad accounts. Creates missing rows on first sight (initial sync only).
//
// IMPORTANT: this function NEVER writes to clients.email. It only reads client
// data to snapshot `customer_email_source` and to seed `reporting_email` once.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-n8n-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const N8N_SECRET = Deno.env.get('N8N_META_REPORTING_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeName(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function accountIdVariants(raw: unknown): { prefixed: string; numeric: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { prefixed: '', numeric: '' };
  const numeric = s.startsWith('act_') ? s.slice(4) : s;
  const prefixed = s.startsWith('act_') ? s : `act_${s}`;
  return { prefixed, numeric };
}

type InAccount = { meta_account_id?: string; meta_account_name?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!N8N_SECRET) {
    return json({ error: 'not_configured', message: 'N8N_META_REPORTING_SECRET missing' }, 500);
  }
  const provided = req.headers.get('x-n8n-secret');
  if (!provided || provided !== N8N_SECRET) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const accounts: InAccount[] = Array.isArray(body?.accounts) ? body.accounts : [];
  if (accounts.length === 0) return json({ error: 'missing_accounts', message: 'accounts[] required' }, 400);
  if (accounts.length > 500) return json({ error: 'too_many_accounts', message: 'max 500 per request' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Normalize incoming accounts to the canonical `act_<n>` key.
  const wanted = accounts
    .map((a) => {
      const v = accountIdVariants(a.meta_account_id);
      return {
        key: v.prefixed,
        numeric: v.numeric,
        name: String(a.meta_account_name ?? '').trim() || null,
      };
    })
    .filter((a) => a.key || a.name);

  const keys = wanted.map((w) => w.key).filter(Boolean);

  // --- existing settings rows ---
  const existing = new Map<string, any>();
  if (keys.length > 0) {
    const { data, error } = await admin
      .from('meta_reporting_settings')
      .select('*')
      .in('meta_account_id', keys);
    if (error) return json({ error: 'db_error', source: 'settings', message: error.message }, 500);
    for (const row of data ?? []) existing.set(row.meta_account_id, row);
  }

  // --- client lookup pool (only needed for missing rows) ---
  const missing = wanted.filter((w) => w.key && !existing.has(w.key));

  const clientByVariant = new Map<string, { id: string; name: string | null; email: string | null }>();
  const clientByName = new Map<string, { id: string; name: string | null; email: string | null }>();

  if (missing.length > 0) {
    const variantPool = new Set<string>();
    for (const m of missing) {
      if (m.key) variantPool.add(m.key);
      if (m.numeric) variantPool.add(m.numeric);
    }
    const variantList = [...variantPool];
    const quoted = variantList.map((v) => `"${v}"`).join(',');

    const { data: clientRows } = await admin
      .from('clients')
      .select('id, name, email, meta_account_id, meta_account_ids')
      .or(`meta_account_id.in.(${quoted}),meta_account_ids.ov.{${quoted}}`);

    for (const c of clientRows ?? []) {
      const ids: string[] = [
        ...(c.meta_account_id ? [c.meta_account_id as string] : []),
        ...(((c.meta_account_ids as string[] | null) ?? []) as string[]),
      ];
      for (const id of ids) {
        const v = accountIdVariants(id);
        for (const variant of [v.prefixed, v.numeric]) {
          if (variant && variantPool.has(variant) && !clientByVariant.has(variant)) {
            clientByVariant.set(variant, { id: c.id, name: c.name, email: c.email });
          }
        }
      }
    }

    // kunde_meta_accounts -> client_id
    const { data: kmaRows } = await admin
      .from('kunde_meta_accounts')
      .select('meta_account_id, meta_account_name, client_id')
      .in('meta_account_id', variantList);

    const kmaClientIds = [...new Set((kmaRows ?? []).map((r: any) => r.client_id).filter(Boolean))];
    const kmaClients = new Map<string, { id: string; name: string | null; email: string | null }>();
    if (kmaClientIds.length > 0) {
      const { data } = await admin.from('clients').select('id, name, email').in('id', kmaClientIds);
      for (const c of data ?? []) kmaClients.set(c.id, { id: c.id, name: c.name, email: c.email });
    }
    for (const r of kmaRows ?? []) {
      const c = r.client_id ? kmaClients.get(r.client_id as string) : null;
      if (!c) continue;
      const v = accountIdVariants(r.meta_account_id);
      for (const variant of [v.prefixed, v.numeric]) {
        if (variant && !clientByVariant.has(variant)) clientByVariant.set(variant, c);
      }
      const n = normalizeName(r.meta_account_name);
      if (n && !clientByName.has(n)) clientByName.set(n, c);
    }

    // Name fallback pool from clients (only used when no id match).
    const names = missing.map((m) => m.name).filter(Boolean) as string[];
    if (names.length > 0) {
      const { data } = await admin.from('clients').select('id, name, email').limit(5000);
      const wantedNames = new Set(names.map(normalizeName));
      for (const c of data ?? []) {
        const n = normalizeName(c.name);
        if (n && wantedNames.has(n) && !clientByName.has(n)) {
          clientByName.set(n, { id: c.id, name: c.name, email: c.email });
        }
      }
    }

    // --- create missing rows ---
    const inserts = missing.map((m) => {
      const hit =
        clientByVariant.get(m.key) ||
        clientByVariant.get(m.numeric) ||
        (m.name ? clientByName.get(normalizeName(m.name)) : undefined) ||
        null;
      const email = hit?.email ?? null;
      return {
        meta_account_id: m.key,
        meta_account_name: m.name,
        client_id: hit?.id ?? null,
        client_name: hit?.name ?? null,
        customer_email_source: email,
        reporting_email: email,
        reporting_email_overridden: false,
        last_synced_at: new Date().toISOString(),
      };
    });

    if (inserts.length > 0) {
      const { data, error } = await admin
        .from('meta_reporting_settings')
        .upsert(inserts, { onConflict: 'meta_account_id', ignoreDuplicates: true })
        .select('*');
      if (error) return json({ error: 'db_error', source: 'insert', message: error.message }, 500);
      for (const row of data ?? []) existing.set(row.meta_account_id, row);

      // Re-read anything that was skipped by ignoreDuplicates.
      const stillMissing = missing.map((m) => m.key).filter((k) => !existing.has(k));
      if (stillMissing.length > 0) {
        const { data: refetched } = await admin
          .from('meta_reporting_settings')
          .select('*')
          .in('meta_account_id', stillMissing);
        for (const row of refetched ?? []) existing.set(row.meta_account_id, row);
      }
    }
  }

  const settings = wanted
    .map((w) => existing.get(w.key))
    .filter(Boolean)
    .map((r: any) => ({
      meta_account_id: r.meta_account_id,
      meta_account_name: r.meta_account_name,
      client_id: r.client_id,
      client_name: r.client_name,
      customer_email_source: r.customer_email_source,
      reporting_email: r.reporting_email,
      reporting_email_overridden: r.reporting_email_overridden,
      reporting_enabled: r.reporting_enabled,
      slack_enabled: r.slack_enabled,
      email_enabled: r.email_enabled,
    }));

  return json({ success: true, settings });
});
