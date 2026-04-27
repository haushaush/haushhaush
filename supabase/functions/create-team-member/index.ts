// Edge Function: create-team-member
// Erstellt einen neuen Mitarbeiter (Auth-User + team-Eintrag + user_permissions + user_roles)
// Nur für eingeloggte Admins.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Permissions {
  can_view_kunden: boolean;
  can_view_close: boolean;
  can_view_meta_ads: boolean;
  can_view_projekte: boolean;
  can_view_sales_kpis: boolean;
  can_view_fulfillment: boolean;
  can_view_finanzen: boolean;
  can_view_team_hr: boolean;
  can_manage_settings: boolean;
}

interface CreatePayload {
  vorname: string;
  nachname: string;
  email: string;
  telefon?: string | null;
  password: string;
  abteilung: string;
  position: string;
  rolle: 'admin' | 'account-manager' | 'user';
  startdatum: string;
  avatar_url?: string | null;
  notizen?: string | null;
  permissions: Permissions;
}

const ALLOWED_DOMAINS = ['viralconnect.de', 'haushhaush.de'];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validatePayload(p: any): { ok: true; data: CreatePayload } | { ok: false; error: string } {
  if (!p || typeof p !== 'object') return { ok: false, error: 'Ungültige Eingabedaten' };
  const required = ['vorname', 'nachname', 'email', 'password', 'abteilung', 'position', 'rolle', 'startdatum'];
  for (const f of required) {
    if (!p[f] || typeof p[f] !== 'string' || !p[f].trim()) {
      return { ok: false, error: `Pflichtfeld fehlt: ${f}` };
    }
  }
  const email = String(p.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Ungültige E-Mail-Adresse' };
  }
  const domain = email.split('@')[1];
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return { ok: false, error: 'Nur @viralconnect.de oder @haushhaush.de erlaubt' };
  }
  if (String(p.password).length < 8) {
    return { ok: false, error: 'Passwort muss mindestens 8 Zeichen enthalten' };
  }
  if (!['admin', 'account-manager', 'user'].includes(p.rolle)) {
    return { ok: false, error: 'Ungültige Rolle' };
  }
  const perms = p.permissions || {};
  const permKeys: (keyof Permissions)[] = [
    'can_view_kunden',
    'can_view_close',
    'can_view_meta_ads',
    'can_view_projekte',
    'can_view_sales_kpis',
    'can_view_fulfillment',
    'can_view_finanzen',
    'can_view_team_hr',
    'can_manage_settings',
  ];
  const cleanPerms: Permissions = {} as Permissions;
  for (const k of permKeys) cleanPerms[k] = !!perms[k];

  return {
    ok: true,
    data: {
      vorname: String(p.vorname).trim(),
      nachname: String(p.nachname).trim(),
      email,
      telefon: p.telefon ? String(p.telefon).trim() : null,
      password: String(p.password),
      abteilung: String(p.abteilung).trim(),
      position: String(p.position).trim(),
      rolle: p.rolle,
      startdatum: String(p.startdatum).trim(),
      avatar_url: p.avatar_url ? String(p.avatar_url).trim() : null,
      notizen: p.notizen ? String(p.notizen).trim() : null,
      permissions: cleanPerms,
    },
  };
}

// Map Portal-Rolle (app_role) → team_rolle Enum
function mapTeamRolle(role: string): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'account-manager':
      return 'Account-Manager';
    default:
      return 'Vollzeit';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Caller-Authentifizierung prüfen
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Nicht authentifiziert' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ error: 'Nicht authentifiziert' }, 401);

    // 2. Admin-Rolle prüfen
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return jsonResponse({ error: 'Keine Berechtigung – nur Admins können Mitarbeiter anlegen' }, 403);
    }

    // 3. Body validieren
    const body = await req.json().catch(() => null);
    const validated = validatePayload(body);
    if (!validated.ok) return jsonResponse({ error: validated.error }, 400);
    const data = validated.data;
    const fullName = `${data.vorname} ${data.nachname}`.trim();

    // 4. Auth-User anlegen
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        position: data.position,
        abteilung: data.abteilung,
      },
    });

    let newUserId: string;
    let importedOrphan = false;

    if (createErr || !created?.user) {
      const msg = createErr?.message || '';
      const isDup = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered');
      if (!isDup) {
        return jsonResponse({ error: msg || 'Fehler beim Anlegen des Auth-Users' }, 500);
      }

      // Look up existing auth user by email (paginated)
      let existingAuthUser: any = null;
      let page = 1;
      while (page <= 20) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr || !list?.users?.length) break;
        existingAuthUser = list.users.find((u: any) => (u.email || '').toLowerCase() === data.email.toLowerCase());
        if (existingAuthUser) break;
        if (list.users.length < 1000) break;
        page++;
      }

      if (!existingAuthUser) {
        return jsonResponse({ error: 'Diese E-Mail ist bereits vergeben' }, 409);
      }

      // Check for existing team row
      const { data: existingTeamRow } = await admin
        .from('team')
        .select('id')
        .eq('id', existingAuthUser.id)
        .maybeSingle();

      if (existingTeamRow) {
        return jsonResponse({ error: 'Diese E-Mail ist bereits vergeben', code: 'duplicate_full' }, 409);
      }

      // Orphan auth user → import: reset password to provided one, then create team row below
      const { error: pwErr } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
        password: data.password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          position: data.position,
          abteilung: data.abteilung,
        },
      });
      if (pwErr) {
        return jsonResponse({ error: `Passwort-Reset fehlgeschlagen: ${pwErr.message}` }, 500);
      }

      newUserId = existingAuthUser.id;
      importedOrphan = true;
    } else {
      newUserId = created.user.id;
    }

    // 5. team-Eintrag
    const { error: teamErr } = await admin.from('team').insert({
      id: newUserId,
      name: fullName,
      email: data.email,
      telefonnummer: data.telefon,
      position: data.position,
      department: data.abteilung,
      abteilung: [data.abteilung],
      rolle: mapTeamRolle(data.rolle) as any,
      portal_rolle: data.rolle,
      startdatum: data.startdatum,
      einstiegsdatum: data.startdatum,
      avatar_url: data.avatar_url,
      notizen: data.notizen,
      mitarbeiter_status: 'Aktiv',
      must_change_password: true,
    });

    if (teamErr) {
      // Rollback Auth user only when we just created it (don't delete pre-existing orphan)
      if (!importedOrphan) {
        await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      }
      return jsonResponse({ error: `team-Insert fehlgeschlagen: ${teamErr.message}` }, 500);
    }

    // 6. user_roles (upsert-style: delete + insert to avoid unique conflicts on import)
    if (importedOrphan) {
      await admin.from('user_roles').delete().eq('user_id', newUserId).then(() => {}, () => {});
      await admin.from('user_permissions').delete().eq('user_id', newUserId).then(() => {}, () => {});
    }
    await admin.from('user_roles').insert({
      user_id: newUserId,
      role: data.rolle as any,
    });

    // 7. user_permissions
    await admin.from('user_permissions').insert({
      user_id: newUserId,
      ...data.permissions,
    });

    return jsonResponse({
      success: true,
      user_id: newUserId,
      email: data.email,
      name: fullName,
      imported: importedOrphan,
      message: importedOrphan
        ? 'Verwaister Auth-User wurde importiert und Profil erstellt'
        : undefined,
    });
  } catch (e) {
    console.error('create-team-member error', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
