// get-meta-notification-contacts
// Server-side endpoint for n8n: maps a batch of Meta ad accounts to
// customer notification contacts. Auth via shared secret header only.
//
// Matching strategy per account:
//   1) primary  -> match by Meta Account ID (both `act_<n>` and numeric variants)
//                  against clients.meta_account_id / clients.meta_account_ids
//                  and kunde_meta_accounts.meta_account_id
//   2) fallback -> only if NO id-match found: normalized name match against
//                  clients.name and kunde_meta_accounts.meta_account_name
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-n8n-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const N8N_SECRET = Deno.env.get('N8N_META_CONTACTS_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeName(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Return both variants of a Meta Account ID: `act_<n>` and plain numeric. */
function accountIdVariants(raw: unknown): { prefixed: string; numeric: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { prefixed: '', numeric: '' };
  const numeric = s.startsWith('act_') ? s.slice(4) : s;
  const prefixed = s.startsWith('act_') ? s : `act_${s}`;
  return { prefixed, numeric };
}

type InAccount = { meta_account_id?: string; meta_account_name?: string };
type ClientRow = { id: string; name: string | null; email: string | null };
type ClientHit = ClientRow & { matched_meta_account_id: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!N8N_SECRET) {
    return json({ error: 'not_configured', message: 'N8N_META_CONTACTS_SECRET missing' }, 500);
  }
  const provided = req.headers.get('x-n8n-secret');
  if (!provided || provided !== N8N_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const accounts: InAccount[] = Array.isArray(body?.accounts) ? body.accounts : [];
  if (accounts.length === 0) {
    return json({ error: 'missing_accounts', message: 'accounts[] required' }, 400);
  }
  if (accounts.length > 500) {
    return json({ error: 'too_many_accounts', message: 'max 500 per request' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Build the full variant pool once so we can query the DB in a single pass.
  const allVariants = new Set<string>();
  for (const a of accounts) {
    const v = accountIdVariants(a.meta_account_id);
    if (v.prefixed) allVariants.add(v.prefixed);
    if (v.numeric) allVariants.add(v.numeric);
  }
  const variantList = [...allVariants];

  // Index: any known meta account id variant -> best client hit
  // (best = has email preferred; then first seen)
  const clientByVariant = new Map<string, ClientHit[]>();
  const pushHit = (variant: string, hit: ClientHit) => {
    const arr = clientByVariant.get(variant) ?? [];
    arr.push(hit);
    clientByVariant.set(variant, arr);
  };

  // --- 1) clients.meta_account_id / clients.meta_account_ids ---
  if (variantList.length > 0) {
    const orExpr = [
      `meta_account_id.in.(${variantList.map((v) => `"${v}"`).join(',')})`,
      `meta_account_ids.ov.{${variantList.map((v) => `"${v}"`).join(',')}}`,
    ].join(',');
    const { data, error } = await admin
      .from('clients')
      .select('id, name, email, meta_account_id, meta_account_ids')
      .or(orExpr);
    if (error) return json({ error: 'db_error', source: 'clients', message: error.message }, 500);

    for (const c of data ?? []) {
      const ids: string[] = [
        ...(c.meta_account_id ? [c.meta_account_id as string] : []),
        ...(((c.meta_account_ids as string[] | null) ?? []) as string[]),
      ];
      for (const id of ids) {
        const v = accountIdVariants(id);
        for (const variant of [v.prefixed, v.numeric]) {
          if (variant && allVariants.has(variant)) {
            pushHit(variant, {
              id: c.id,
              name: c.name,
              email: c.email,
              matched_meta_account_id: id,
            });
          }
        }
      }
    }
  }

  // --- 2) kunde_meta_accounts -> clients (only for variants not resolved yet) ---
  const unresolved = variantList.filter((v) => !clientByVariant.has(v));
  if (unresolved.length > 0) {
    const { data, error } = await admin
      .from('kunde_meta_accounts')
      .select('meta_account_id, clients:client_id(id, name, email)')
      .in('meta_account_id', unresolved);
    if (error)
      return json({ error: 'db_error', source: 'kunde_meta_accounts', message: error.message }, 500);
    for (const row of (data ?? []) as any[]) {
      const c = row.clients as ClientRow | null;
      if (!c) continue;
      const v = accountIdVariants(row.meta_account_id);
      for (const variant of [v.prefixed, v.numeric]) {
        if (variant && allVariants.has(variant)) {
          pushHit(variant, {
            id: c.id,
            name: c.name,
            email: c.email,
            matched_meta_account_id: row.meta_account_id,
          });
        }
      }
    }
  }

  // --- 3) name fallback index (only built if needed) ---
  let nameIndex: Map<string, ClientHit> | null = null;
  const nameNeeded = accounts.some((a) => {
    const v = accountIdVariants(a.meta_account_id);
    const hasIdHit =
      (v.prefixed && clientByVariant.has(v.prefixed)) ||
      (v.numeric && clientByVariant.has(v.numeric));
    return !hasIdHit && normalizeName(a.meta_account_name).length > 0;
  });
  if (nameNeeded) {
    nameIndex = new Map();
    const { data: allClients, error: e3 } = await admin
      .from('clients')
      .select('id, name, email')
      .not('name', 'is', null);
    if (e3) return json({ error: 'db_error', source: 'clients_name', message: e3.message }, 500);
    for (const c of allClients ?? []) {
      const key = normalizeName(c.name);
      if (!key) continue;
      const existing = nameIndex.get(key);
      // Prefer entries that actually have an email.
      if (!existing || (!existing.email && c.email)) {
        nameIndex.set(key, {
          id: c.id,
          name: c.name,
          email: c.email,
          matched_meta_account_id: '',
        });
      }
    }
    const { data: kmaAll, error: e4 } = await admin
      .from('kunde_meta_accounts')
      .select('meta_account_name, clients:client_id(id, name, email)')
      .not('meta_account_name', 'is', null);
    if (e4)
      return json({ error: 'db_error', source: 'kma_name', message: e4.message }, 500);
    for (const row of (kmaAll ?? []) as any[]) {
      const key = normalizeName(row.meta_account_name);
      const c = row.clients as ClientRow | null;
      if (!key || !c) continue;
      const existing = nameIndex.get(key);
      if (!existing || (!existing.email && c.email)) {
        nameIndex.set(key, {
          id: c.id,
          name: c.name,
          email: c.email,
          matched_meta_account_id: '',
        });
      }
    }
  }

  const pickBestHit = (hits: ClientHit[], accountName: string | null): ClientHit => {
    if (hits.length === 1) return hits[0];
    const nameKey = normalizeName(accountName);
    // 1. prefer hit whose client name is contained in the account name (or vice versa) AND has email
    const scored = hits.map((h) => {
      const n = normalizeName(h.name);
      let score = 0;
      if (h.email) score += 2;
      if (nameKey && n) {
        if (nameKey === n) score += 4;
        else if (nameKey.includes(n) || n.includes(nameKey)) score += 3;
      }
      return { h, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].h;
  };

  const contacts = accounts.map((a) => {
    const v = accountIdVariants(a.meta_account_id);
    const inputId = a.meta_account_id ?? null;
    const accountName = a.meta_account_name ?? null;

    const idHits =
      (v.prefixed && clientByVariant.get(v.prefixed)) ||
      (v.numeric && clientByVariant.get(v.numeric)) ||
      null;

    if (idHits && idHits.length > 0) {
      const hit = pickBestHit(idHits, accountName);
      const hasEmail = !!hit.email;
      return {
        meta_account_id: v.prefixed || inputId,
        meta_account_name: accountName,
        client_id: hit.id,
        client_name: hit.name,
        email: hit.email,
        match_type: 'meta_account_id',
        missing_contact: !hasEmail,
        debug_input_meta_account_id: inputId,
        debug_input_meta_account_id_numeric: v.numeric || null,
        debug_found_client_meta_account_id: hit.matched_meta_account_id || null,
        debug_email_source: hasEmail ? 'clients.email' : null,
        debug_reason: hasEmail
          ? 'matched customer by meta account id'
          : 'matched customer by meta account id but client has no email',
      };
    }

    // Name fallback
    const nameKey = normalizeName(accountName);
    if (nameIndex && nameKey) {
      let nameHit = nameIndex.get(nameKey) ?? null;
      if (!nameHit) {
        // loose contains match: account name contains client name
        for (const [key, val] of nameIndex) {
          if (key && (nameKey.includes(key) || key.includes(nameKey))) {
            if (!nameHit || (!nameHit.email && val.email)) nameHit = val;
          }
        }
      }
      if (nameHit) {
        const hasEmail = !!nameHit.email;
        return {
          meta_account_id: v.prefixed || inputId,
          meta_account_name: accountName,
          client_id: nameHit.id,
          client_name: nameHit.name,
          email: nameHit.email,
          match_type: 'account_name',
          missing_contact: !hasEmail,
          debug_input_meta_account_id: inputId,
          debug_input_meta_account_id_numeric: v.numeric || null,
          debug_found_client_meta_account_id: null,
          debug_email_source: hasEmail ? 'clients.email' : null,
          debug_reason: hasEmail
            ? 'no meta account id match; matched customer by normalized account name'
            : 'name fallback matched a client but no email on record',
        };
      }
    }

    return {
      meta_account_id: v.prefixed || inputId,
      meta_account_name: accountName,
      client_id: null,
      client_name: null,
      email: null,
      match_type: null,
      missing_contact: true,
      debug_input_meta_account_id: inputId,
      debug_input_meta_account_id_numeric: v.numeric || null,
      debug_found_client_meta_account_id: null,
      debug_email_source: null,
      debug_reason:
        'no client found for this meta account id (checked clients.meta_account_id, clients.meta_account_ids, kunde_meta_accounts.meta_account_id) and no name fallback match',
    };
  });

  return json({ success: true, contacts });
});
