// Edge Function: recover-admin-user
// Notfall-Wiederherstellung des Admin-Accounts (admin@haushhaush.de).
// Geschützt durch RECOVERY_TOKEN (Supabase Secret).
//
// Repariert in dieser Reihenfolge:
//   1. auth.users  – legt User an oder setzt Passwort zurück
//   2. public.team – legt Profil an, hebt Soft-Delete auf, setzt rolle=Admin
//   3. user_roles  – stellt Rolle 'admin' sicher
//   4. user_permissions – legt vollständigen Admin-Zugriff an
//
// Aufruf: POST { recoveryToken, adminEmail?, newPassword? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function findAuthUserByEmail(admin: any, email: string) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u: any) => (u.email || '').toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 1000) return null;
    page++;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const RECOVERY_TOKEN = Deno.env.get('RECOVERY_TOKEN');
    if (!RECOVERY_TOKEN) {
      return jsonResponse({ error: 'RECOVERY_TOKEN ist nicht konfiguriert' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const recoveryToken = String(body?.recoveryToken || '');
    const adminEmail = String(body?.adminEmail || 'admin@haushhaush.de').trim().toLowerCase();
    const newPassword = body?.newPassword ? String(body.newPassword) : undefined;

    if (recoveryToken !== RECOVERY_TOKEN) {
      return jsonResponse({ error: 'Ungültiger Recovery-Token' }, 401);
    }

    if (newPassword && newPassword.length < 8) {
      return jsonResponse({ error: 'Passwort muss mindestens 8 Zeichen enthalten' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const report: { steps: string[] } = { steps: [] };

    // === Step 1: auth.users ===
    let authUser = await findAuthUserByEmail(admin, adminEmail);

    if (!authUser) {
      report.steps.push(`auth.users: Admin-User FEHLT – wird neu angelegt`);

      if (!newPassword) {
        return jsonResponse(
          {
            error:
              'Admin-User existiert nicht in auth.users. Bitte newPassword im Request mitsenden, um den User neu anzulegen.',
            report,
          },
          400,
        );
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: adminEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Admin' },
      });

      if (createErr || !created?.user) {
        return jsonResponse(
          {
            error: `Auth-User konnte nicht angelegt werden: ${createErr?.message || 'unbekannter Fehler'}`,
            report,
          },
          500,
        );
      }

      authUser = created.user;
      report.steps.push(`auth.users: Neu angelegt (id=${authUser.id})`);
    } else {
      report.steps.push(`auth.users: OK (id=${authUser.id})`);

      if (newPassword) {
        const { error: pwErr } = await admin.auth.admin.updateUserById(authUser.id, {
          password: newPassword,
          email_confirm: true,
        });
        if (pwErr) {
          report.steps.push(`auth.users: Passwort-Reset FEHLGESCHLAGEN – ${pwErr.message}`);
        } else {
          report.steps.push(`auth.users: Passwort zurückgesetzt`);
        }
      }
    }

    const userId = authUser!.id;

    // === Step 2: public.team ===
    const { data: teamRow, error: teamSelErr } = await admin
      .from('team')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (teamSelErr) {
      report.steps.push(`public.team: SELECT-Fehler – ${teamSelErr.message}`);
    }

    if (!teamRow) {
      report.steps.push(`public.team: Zeile FEHLT – wird angelegt`);

      const { error: insertErr } = await admin.from('team').insert({
        id: userId,
        name: 'Admin',
        email: adminEmail,
        position: 'CEO',
        department: 'Management',
        abteilung: ['Management'],
        rolle: 'Admin',
        portal_rolle: 'admin',
        startdatum: new Date().toISOString().split('T')[0],
        einstiegsdatum: new Date().toISOString().split('T')[0],
        mitarbeiter_status: 'Aktiv',
        must_change_password: false,
      } as any);

      if (insertErr) {
        return jsonResponse(
          { error: `team-Zeile konnte nicht angelegt werden: ${insertErr.message}`, report },
          500,
        );
      }
      report.steps.push(`public.team: Zeile angelegt (rolle=Admin)`);
    } else {
      const updates: Record<string, unknown> = {};
      if ((teamRow as any).deleted_at) {
        updates.deleted_at = null;
        if ('deleted_by' in (teamRow as any)) updates.deleted_by = null;
      }
      const currentRolle = String((teamRow as any).rolle || '');
      if (currentRolle !== 'Admin' && currentRolle !== 'Owner') {
        updates.rolle = 'Admin';
      }
      if ((teamRow as any).portal_rolle !== 'admin') {
        updates.portal_rolle = 'admin';
      }
      if ((teamRow as any).must_change_password) {
        updates.must_change_password = false;
      }
      if ((teamRow as any).mitarbeiter_status && (teamRow as any).mitarbeiter_status !== 'Aktiv') {
        updates.mitarbeiter_status = 'Aktiv';
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await admin.from('team').update(updates).eq('id', userId);
        if (updateErr) {
          return jsonResponse(
            { error: `team-Zeile konnte nicht repariert werden: ${updateErr.message}`, report },
            500,
          );
        }
        report.steps.push(`public.team: Repariert (${Object.keys(updates).join(', ')})`);
      } else {
        report.steps.push(`public.team: OK (rolle=${currentRolle})`);
      }
    }

    // === Step 3: user_roles ===
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      const { error: roleErr } = await admin
        .from('user_roles')
        .insert({ user_id: userId, role: 'admin' as any });
      if (roleErr) {
        report.steps.push(`user_roles: Insert FEHLGESCHLAGEN – ${roleErr.message}`);
      } else {
        report.steps.push(`user_roles: Rolle 'admin' hinzugefügt`);
      }
    } else {
      report.steps.push(`user_roles: OK (admin-Rolle vorhanden)`);
    }

    // === Step 4: user_permissions ===
    const { data: permsRow } = await admin
      .from('user_permissions')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    const fullPermissions = {
      can_view_kunden: true,
      can_view_close: true,
      can_view_meta_ads: true,
      can_view_projekte: true,
      can_view_sales_kpis: true,
      can_view_fulfillment: true,
      can_view_finanzen: true,
      can_view_team_hr: true,
      can_manage_settings: true,
    };

    if (!permsRow) {
      const { error: permsErr } = await admin
        .from('user_permissions')
        .insert({ user_id: userId, ...fullPermissions });
      if (permsErr) {
        report.steps.push(`user_permissions: Insert FEHLGESCHLAGEN – ${permsErr.message}`);
      } else {
        report.steps.push(`user_permissions: Mit allen Rechten angelegt`);
      }
    } else {
      const { error: updErr } = await admin
        .from('user_permissions')
        .update(fullPermissions)
        .eq('user_id', userId);
      if (updErr) {
        report.steps.push(`user_permissions: Update FEHLGESCHLAGEN – ${updErr.message}`);
      } else {
        report.steps.push(`user_permissions: Auf volle Admin-Rechte gesetzt`);
      }
    }

    return jsonResponse({
      ok: true,
      message: 'Admin-Recovery abgeschlossen. Du kannst dich jetzt einloggen.',
      user_id: userId,
      email: adminEmail,
      report,
    });
  } catch (e) {
    console.error('recover-admin-user error', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'Unbekannter Fehler' },
      500,
    );
  }
});
