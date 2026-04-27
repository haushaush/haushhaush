// Edge Function: delete-orphan-auth-user
// Hard-deletes an auth.users entry that has NO corresponding team row.
// Refuses if any team row exists (those must use the soft-delete flow).
// Admins only.

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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ error: 'Nicht authentifiziert' }, 401);

    const callerId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Caller must be admin
    const { data: callerRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!callerRole) return jsonResponse({ error: 'Keine Berechtigung – nur Admins' }, 403);

    const body = await req.json().catch(() => null);
    const targetId = body?.user_id;
    if (!targetId || typeof targetId !== 'string') {
      return jsonResponse({ error: 'user_id fehlt' }, 400);
    }
    if (targetId === callerId) {
      return jsonResponse({ error: 'Du kannst dein eigenes Konto nicht löschen' }, 403);
    }

    // Safety: verify NO team row exists
    const { data: teamRow } = await admin
      .from('team')
      .select('id')
      .eq('id', targetId)
      .maybeSingle();
    if (teamRow) {
      return jsonResponse(
        { error: 'Mitarbeiter-Profil existiert – bitte den normalen Lösch-Flow verwenden' },
        409,
      );
    }

    // Best-effort cleanup of permission/role rows that may exist
    await admin.from('user_permissions').delete().eq('user_id', targetId).then(() => {}, () => {});
    await admin.from('user_roles').delete().eq('user_id', targetId).then(() => {}, () => {});

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      return jsonResponse({ error: `Auth-Löschung fehlgeschlagen: ${delErr.message}` }, 500);
    }

    return jsonResponse({ success: true, deleted_id: targetId });
  } catch (e) {
    console.error('delete-orphan-auth-user error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
