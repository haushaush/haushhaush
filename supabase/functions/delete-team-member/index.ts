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

    // === Cleanup dependent rows BEFORE deleting auth user ===
    // CASCADE FKs now exist for most of these, but we still clean explicitly
    // as a safety net for tables that might be added later without CASCADE.
    const cleanedTables: Record<string, number | string> = {};

    // Tables owned by the user (CASCADE/personal data) — delete rows
    const userIdTables = [
      'user_permissions',
      'user_roles',
      'team_hr_data',
      'google_drive_connections',
      'drive_connection',
      'email_accounts',
      'email_messages_cache',
      'ad_creatives',
      'aria_interactions',
      'api_tokens',
      'notifications',
      'notification_settings',
      'integration_settings',
      'oauth_states',
      'support_tickets',
      'time_entries',
    ];
    for (const table of userIdTables) {
      const { error, count } = await admin
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', targetId);
      if (error) {
        if (!error.message?.includes('does not exist') && error.code !== '42P01') {
          console.warn(`[delete-team-member] cleanup ${table}: ${error.message}`);
          cleanedTables[table] = `error: ${error.message}`;
        }
      } else {
        cleanedTables[table] = count ?? 0;
      }
    }

    // Tables to nullify (audit/historical references)
    const setNullTargets = [
      { table: 'bug_reports', column: 'user_id' },
      { table: 'employee_requests', column: 'user_id' },
      { table: 'employee_requests', column: 'reviewed_by' },
      { table: 'kunde_meta_accounts', column: 'matched_by' },
      { table: 'team_hr_data', column: 'updated_by' },
      { table: 'aria_knowledge', column: 'created_by' },
      { table: 'aria_knowledge', column: 'last_updated_by' },
      { table: 'aria_memory', column: 'created_by' },
      { table: 'aria_automations', column: 'created_by' },
      { table: 'drive_pinned_files', column: 'pinned_by' },
      { table: 'close_deals', column: 'assigned_to' },
      { table: 'wiki_pages', column: 'created_by' },
    ];
    for (const { table, column } of setNullTargets) {
      const { error } = await admin
        .from(table)
        .update({ [column]: null })
        .eq(column, targetId);
      if (error && !error.message?.includes('does not exist') && error.code !== '42P01') {
        console.warn(`[delete-team-member] nullify ${table}.${column}: ${error.message}`);
      }
    }

    // Finally remove the team profile row
    const { error: teamErr } = await admin.from('team').delete().eq('id', targetId);
    if (teamErr) {
      console.warn(`[delete-team-member] team delete: ${teamErr.message}`);
    }

    // Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      console.error('[delete-team-member] auth.deleteUser failed:', delErr);
      return jsonResponse(
        {
          error: `Auth-Löschung fehlgeschlagen: ${delErr.message}`,
          hint: 'Möglicherweise gibt es noch verknüpfte Daten. Prüfe die Edge-Function-Logs.',
          cleaned: cleanedTables,
        },
        500,
      );
    }

    console.log(`[delete-team-member] ✓ deleted ${targetId} (${target.name})`);
    return jsonResponse({
      success: true,
      deleted_id: targetId,
      deleted_name: target.name,
      cleaned: cleanedTables,
    });
  } catch (e) {
    console.error('delete-team-member error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
