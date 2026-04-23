// Edge Function: delete-team-member
// Löscht einen Mitarbeiter (Auth-User + team + user_roles + user_permissions)
// Nur für Admins. Verbietet Self-Delete und Löschen anderer Admins.

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

    if (!callerRole) {
      return jsonResponse({ error: 'Keine Berechtigung – nur Admins können Mitarbeiter löschen' }, 403);
    }

    const body = await req.json().catch(() => null);
    const targetId = body?.user_id;
    const confirmName = String(body?.confirm_name || '').trim();

    if (!targetId || typeof targetId !== 'string') {
      return jsonResponse({ error: 'user_id fehlt' }, 400);
    }

    if (targetId === callerId) {
      return jsonResponse({ error: 'Du kannst dein eigenes Konto nicht löschen' }, 403);
    }

    // Load target
    const { data: target } = await admin
      .from('team')
      .select('id, name, email')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) {
      return jsonResponse({ error: 'Mitarbeiter nicht gefunden' }, 404);
    }

    // Confirm name match
    if (confirmName.toLowerCase() !== String(target.name || '').trim().toLowerCase()) {
      return jsonResponse({ error: 'Name stimmt nicht überein' }, 400);
    }

    // Block deleting other admins
    const { data: targetIsAdmin } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetId)
      .eq('role', 'admin')
      .maybeSingle();

    if (targetIsAdmin) {
      return jsonResponse({ error: 'Andere Admin-Konten können nicht gelöscht werden' }, 403);
    }

    // Cleanup app rows first (best effort)
    await admin.from('user_permissions').delete().eq('user_id', targetId).then(() => {}, () => {});
    await admin.from('user_roles').delete().eq('user_id', targetId).then(() => {}, () => {});
    await admin.from('team').delete().eq('id', targetId).then(() => {}, () => {});

    // Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      return jsonResponse({ error: `Auth-Löschung fehlgeschlagen: ${delErr.message}` }, 500);
    }

    return jsonResponse({ success: true, deleted_id: targetId, deleted_name: target.name });
  } catch (e) {
    console.error('delete-team-member error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
