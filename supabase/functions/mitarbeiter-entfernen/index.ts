// Edge Function: mitarbeiter-entfernen
// Aktionen: "zaehlen" (abhängige Datensätze), "sperren" (Zugang entziehen), "loeschen" (endgültig).
// Aufrufer wird ausschließlich über das JWT als Admin geprüft, nie über den Request-Body.
// Endgültiges Löschen erhält Zeiterfassungen, Check-ins und Bonus-Daten: Hängen Daten am Konto,
// wird der Personenbezug entfernt (Stammdaten anonymisiert, Anmeldung gesperrt) statt den
// Auth-Benutzer zu löschen, weil dessen Löschung diese Daten per Fremdschlüssel mitlöschen würde.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const BONUS_TABELLEN = ['bonus_checkins', 'bonus_monate', 'bonus_upsells', 'bonus_churn_events', 'bonus_cash_collect', 'bonus_kunden_aktuell', 'bonus_abwesenheit', 'bonus_monat_freigaben'];
const PERSOENLICH = ['user_permissions', 'user_roles', 'team_hr_data', 'google_drive_connections', 'drive_connection', 'email_accounts', 'email_messages_cache', 'api_tokens', 'notification_settings', 'integration_settings', 'oauth_states', 'mfa_recovery_codes', 'mfa_trusted_devices', 'user_preferences'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Nicht angemeldet' }, 401);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (cErr || !claims?.claims?.sub) return json({ error: 'Nicht angemeldet' }, 401);
    const callerId = claims.claims.sub as string;

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: istAdmin } = await admin.from('user_roles').select('role').eq('user_id', callerId).eq('role', 'admin').maybeSingle();
    if (!istAdmin) return json({ error: 'Nur Admins dürfen Mitarbeiter entfernen' }, 403);

    const body = await req.json().catch(() => null);
    const aktion = body?.aktion;
    const id = body?.team_id;
    if (!['zaehlen', 'sperren', 'loeschen'].includes(aktion) || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ error: 'Ungültige Anfrage' }, 400);
    }

    const { data: person } = await admin.from('team').select('id, name').eq('id', id).maybeSingle();
    if (!person) return json({ error: 'Mitarbeiter nicht gefunden' }, 404);

    // Zählen (für Dialog und vor dem Löschen)
    const zaehle = async (t: string, col: string, vals: string[]) => {
      if (!vals.length) return 0;
      const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true }).in(col, vals);
      if (error) { console.warn(`[mitarbeiter-entfernen] count ${t}: ${error.message}`); return 0; }
      return count ?? 0;
    };
    const { data: bm } = await admin.from('bonus_mitarbeiter').select('id').eq('team_id', id);
    const bmIds = (bm || []).map((r: any) => r.id);
    const zeiteintraege = await zaehle('time_entries', 'user_id', [id]);
    const checkins = await zaehle('daily_checkins', 'user_id', [id]);
    let bonus = bmIds.length;
    for (const t of BONUS_TABELLEN) bonus += await zaehle(t, 'mitarbeiter_id', bmIds);
    const zahlen = { zeiteintraege, checkins, bonus };
    if (aktion === 'zaehlen') return json({ ok: true, name: person.name, zahlen });

    if (id === callerId) return json({ error: 'Der eigene Account lässt sich nicht entfernen' }, 403);
    const { data: zielAdmin } = await admin.from('user_roles').select('role').eq('user_id', id).eq('role', 'admin').maybeSingle();
    if (zielAdmin) {
      const { count } = await admin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin');
      if ((count ?? 0) <= 1) return json({ error: 'Der letzte verbleibende Admin lässt sich nicht entfernen' }, 403);
    }

    const { data: authUser } = await admin.auth.admin.getUserById(id);
    const sperren = async () => {
      if (authUser?.user) {
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
        if (error) throw new Error(`Sperren fehlgeschlagen: ${error.message}`);
        await admin.from('user_access_status').upsert({ user_id: id, is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: callerId }, { onConflict: 'user_id' });
      }
    };

    if (aktion === 'sperren') {
      await sperren();
      console.log(`[mitarbeiter-entfernen] gesperrt ${id}`);
      return json({ ok: true, ergebnis: 'gesperrt', zugang: authUser?.user ? 'gesperrt' : 'kein Login-Konto vorhanden' });
    }

    // loeschen
    const bestaetigt = String(body?.bestaetigung_name || '').trim().toLowerCase() === String(person.name).trim().toLowerCase();
    if (!bestaetigt) return json({ error: 'Der eingetippte Name stimmt nicht überein' }, 400);

    for (const t of PERSOENLICH) {
      const { error } = await admin.from(t).delete().eq('user_id', id);
      if (error && error.code !== '42P01' && error.code !== '42703') console.warn(`[mitarbeiter-entfernen] ${t}: ${error.message}`);
    }

    const hatDaten = zeiteintraege + checkins + bonus > 0;
    if (!hatDaten) {
      if (authUser?.user) {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) return json({ error: `Löschen fehlgeschlagen: ${error.message}` }, 500);
      }
      await admin.from('team').delete().eq('id', id);
      return json({ ok: true, ergebnis: 'geloescht', zahlen });
    }

    // Daten erhalten, Personenbezug entfernen
    await sperren();
    if (authUser?.user) {
      const { error } = await admin.auth.admin.updateUserById(id, { email: `entfernt-${id}@invalid.local`, phone: '', user_metadata: {} });
      if (error) console.warn(`[mitarbeiter-entfernen] auth anonymisieren: ${error.message}`);
    }
    const { error: tErr } = await admin.from('team').update({
      name: 'Entfernte Person', email: null, telefonnummer: null, notizen: null, avatar_url: null, gehalt: null,
      notion_id: null, notion_url: null, position: null, mitarbeiter_status: 'entfernt',
    }).eq('id', id);
    if (tErr) return json({ error: `Stammdaten konnten nicht entfernt werden: ${tErr.message}` }, 500);
    console.log(`[mitarbeiter-entfernen] Personenbezug entfernt ${id}`);
    return json({ ok: true, ergebnis: 'anonymisiert', zahlen });
  } catch (e) {
    console.error('[mitarbeiter-entfernen]', e);
    return json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
