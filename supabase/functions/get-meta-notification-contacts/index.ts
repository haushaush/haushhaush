// get-meta-notification-contacts
// Server-side endpoint for n8n: maps a batch of Meta ad accounts to
// customer notification contacts. Auth via shared secret header only.
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

function normalizeAccountId(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.startsWith('act_') ? s : `act_${s}`;
}

type InAccount = { meta_account_id?: string; meta_account_name?: string };

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

  const idList = Array.from(
    new Set(
      accounts
        .map((a) => normalizeAccountId(a.meta_account_id))
        .filter((s) => s.length > 0),
    ),
  );

  // 1) Direct match via clients.meta_account_id / meta_account_ids
  const clientById = new Map<string, { id: string; name: string | null; email: string | null }>();
  if (idList.length > 0) {
    const { data: byPrimary, error: e1 } = await admin
      .from('clients')
      .select('id, name, email, meta_account_id, meta_account_ids')
      .or(
        `meta_account_id.in.(${idList.map((v) => `"${v}"`).join(',')}),meta_account_ids.ov.{${idList.map((v) => `"${v}"`).join(',')}}`,
      );
    if (e1) return json({ error: 'db_error', message: e1.message }, 500);
    for (const c of byPrimary ?? []) {
      const ids: string[] = [
        ...(c.meta_account_id ? [c.meta_account_id] : []),
        ...((c.meta_account_ids as string[] | null) ?? []),
      ];
      for (const id of ids) {
        if (idList.includes(id) && !clientById.has(id)) {
          clientById.set(id, { id: c.id, name: c.name, email: c.email });
        }
      }
    }
  }

  // 2) Fallback via kunde_meta_accounts -> clients
  const missingIds = idList.filter((id) => !clientById.has(id));
  if (missingIds.length > 0) {
    const { data: kma, error: e2 } = await admin
      .from('kunde_meta_accounts')
      .select('meta_account_id, client_id, clients:client_id(id, name, email)')
      .in('meta_account_id', missingIds);
    if (e2) return json({ error: 'db_error', message: e2.message }, 500);
    for (const row of (kma ?? []) as any[]) {
      const c = row.clients;
      if (c && !clientById.has(row.meta_account_id)) {
        clientById.set(row.meta_account_id, { id: c.id, name: c.name, email: c.email });
      }
    }
  }

  // 3) Name fallback pool
  const nameNeeded = accounts.some((a) => {
    const id = normalizeAccountId(a.meta_account_id);
    return !clientById.has(id) && normalizeName(a.meta_account_name).length > 0;
  });

  const nameIndex = new Map<string, { id: string; name: string | null; email: string | null }>();
  if (nameNeeded) {
    const { data: allClients, error: e3 } = await admin
      .from('clients')
      .select('id, name, email')
      .not('name', 'is', null);
    if (e3) return json({ error: 'db_error', message: e3.message }, 500);
    for (const c of allClients ?? []) {
      const key = normalizeName(c.name);
      if (key && !nameIndex.has(key)) {
        nameIndex.set(key, { id: c.id, name: c.name, email: c.email });
      }
    }
    // Also index kunde_meta_accounts.meta_account_name -> client
    const { data: kmaAll, error: e4 } = await admin
      .from('kunde_meta_accounts')
      .select('meta_account_name, clients:client_id(id, name, email)')
      .not('meta_account_name', 'is', null);
    if (e4) return json({ error: 'db_error', message: e4.message }, 500);
    for (const row of (kmaAll ?? []) as any[]) {
      const key = normalizeName(row.meta_account_name);
      const c = row.clients;
      if (key && c && !nameIndex.has(key)) {
        nameIndex.set(key, { id: c.id, name: c.name, email: c.email });
      }
    }
  }

  const contacts = accounts.map((a) => {
    const id = normalizeAccountId(a.meta_account_id);
    const name = a.meta_account_name ?? null;

    let hit = id ? clientById.get(id) : undefined;
    let matchType: 'meta_account_id' | 'account_name' | null = hit ? 'meta_account_id' : null;

    if (!hit) {
      const key = normalizeName(name);
      if (key) {
        const found = nameIndex.get(key);
        if (found) {
          hit = found;
          matchType = 'account_name';
        }
      }
    }

    return {
      meta_account_id: id || a.meta_account_id || null,
      meta_account_name: name,
      client_id: hit?.id ?? null,
      client_name: hit?.name ?? null,
      email: hit?.email ?? null,
      match_type: hit && hit.email ? matchType : null,
      missing_contact: !hit || !hit.email,
    };
  });

  return json({ success: true, contacts });
});
