// Edge Function: list-all-users
// Lists all auth.users merged with team rows. Returns orphan flag for users
// that exist in auth but have no corresponding team row. Admins only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Nicht authentifiziert' }, 401);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      console.error('list-all-users auth failed', claimsErr);
      return jsonResponse({ error: 'Nicht authentifiziert' }, 401);
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify caller is admin (via user_roles table)
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return jsonResponse({ error: 'Keine Berechtigung – nur Admins' }, 403);
    }

    // Paginate auth.users
    const allAuthUsers: any[] = [];
    let page = 1;
    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      allAuthUsers.push(...data.users);
      if (data.users.length < 1000) break;
      page++;
    }

    // Load team rows
    const { data: teamRows } = await admin.from('team').select('*');
    const teamMap = new Map<string, any>((teamRows || []).map((t: any) => [t.id, t]));

    const merged = allAuthUsers.map((au) => {
      const team = teamMap.get(au.id);
      const isDeleted = !!team?.mitarbeiter_status && team.mitarbeiter_status === 'Gelöscht';
      return {
        id: au.id,
        email: au.email,
        auth_created_at: au.created_at,
        last_sign_in_at: au.last_sign_in_at,
        email_confirmed: !!au.email_confirmed_at,
        name: team?.name || null,
        rolle: team?.rolle || null,
        portal_rolle: team?.portal_rolle || null,
        department: team?.department || null,
        position: team?.position || null,
        startdatum: team?.startdatum || null,
        avatar_url: team?.avatar_url || null,
        mitarbeiter_status: team?.mitarbeiter_status || null,
        is_orphan: !team,
        is_deleted: isDeleted,
        is_active: !!team && !isDeleted,
      };
    });

    return jsonResponse({
      ok: true,
      users: merged,
      stats: {
        total: merged.length,
        active: merged.filter((u) => u.is_active).length,
        orphan: merged.filter((u) => u.is_orphan).length,
        deleted: merged.filter((u) => u.is_deleted).length,
      },
    });
  } catch (e) {
    console.error('list-all-users error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
