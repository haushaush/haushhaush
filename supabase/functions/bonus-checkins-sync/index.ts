// Narrow, independent sync: pulls ONLY "Client Checkin" custom activities from Close
// for the clients in bonus_kunden_snapshot and writes them to bonus_checkins.
// Any Close API error aborts the run without touching stored data (a too-low call count costs the employee money).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ACTIVITY_TYPE_ID = "actitype_7JTWiuJtwme5VEukVy6kJ6";
const CLOSE = "https://api.close.com/api/v1";

class CloseError extends Error {}

function closeClient(apiKey: string) {
  const auth = "Basic " + btoa(`${apiKey}:`);
  return async function get(path: string): Promise<any> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(CLOSE + path, { headers: { Authorization: auth, Accept: "application/json" } });
      if (r.status === 429) {
        const wait = Number(r.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((res) => setTimeout(res, Math.min(wait, 30) * 1000));
        continue;
      }
      const text = await r.text();
      if (r.status === 404 && path.startsWith("/lead/") && !path.startsWith("/lead/?")) return null;
      if (!r.ok) throw new CloseError(`Close API ${r.status} bei ${path.split("?")[0]}: ${text.slice(0, 300)}`);
      return JSON.parse(text);
    }
    throw new CloseError(`Close API Rate-Limit bei ${path.split("?")[0]} nach 5 Versuchen`);
  };
}

const berlinDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(iso));
const nextMonth = (m: string) => { const d = new Date(m + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const currentMonthBerlin = () => berlinDate(new Date().toISOString()).slice(0, 7) + "-01";
const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : Array.isArray(v) ? v.join(", ") : String(v));

type Fields = Record<"anlass" | "stimmung" | "kampagne" | "offen" | "upsell" | "schritt" | "faellig", string | null>;

async function resolveFields(get: (p: string) => Promise<any>): Promise<Fields> {
  const list = await get(`/custom_activity/`);
  const t = (list.data || []).find((x: any) => x.id === ACTIVITY_TYPE_ID);
  if (!t) throw new CloseError(`Activity-Typ ${ACTIVITY_TYPE_ID} in diesem Close-Account nicht gefunden (vorhanden: ${(list.data || []).map((x: any) => x.name).join(", ")})`);
  let fields: any[] = t.fields || [];
  if (!fields.length) {
    const cf = await get(`/custom_field/activity/?_limit=200`);
    fields = (cf.data || []).filter((f: any) => f.custom_activity_type_id === ACTIVITY_TYPE_ID);
  }
  const find = (...needles: string[]) => {
    const f = fields.find((x) => needles.some((n) => String(x.name || "").toLowerCase().includes(n)));
    return f ? `custom.${f.id}` : null;
  };
  const res: Fields = {
    anlass: find("anlass"),
    stimmung: find("stimmung"),
    kampagne: find("kampagne"),
    offen: find("offene"),
    upsell: find("upsell"),
    schritt: find("nächster schritt", "naechster schritt"),
    faellig: find("fällig", "faellig", "nächster checkin", "nächster check-in"),
  };
  if (!res.stimmung || !res.anlass) throw new CloseError(`Felder „Anlass"/„Stimmung" im Activity-Typ nicht gefunden (vorhanden: ${fields.map((f) => f.name).join(", ")})`);
  return res;
}

async function syncOne(admin: any, get: (p: string) => Promise<any>, fields: Fields, monat: string, mitarbeiter_id: string) {
  const { data: ma, error: mErr } = await admin.from("bonus_mitarbeiter").select("id, close_user_id").eq("id", mitarbeiter_id).maybeSingle();
  if (mErr || !ma) throw new Error("bonus_mitarbeiter nicht gefunden");
  const closeUserId: string | null = ma.close_user_id ?? null;
  if (!closeUserId) throw new Error("Keine Close-User-ID für den Mitarbeiter hinterlegt (bonus_mitarbeiter.close_user_id)");

  const { data: snap, error: sErr } = await admin.from("bonus_kunden_snapshot").select("client_id, clients:client_id(name)").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  if (sErr) throw new Error("Snapshot: " + sErr.message);
  const clientIds = (snap || []).map((s: any) => s.client_id);
  if (!clientIds.length) throw new Error("Kein Kundensnapshot für diesen Monat — ohne Nenner kein Sync");

  const [{ data: l1 }, { data: l2 }, { data: l3 }] = await Promise.all([
    admin.from("close_link").select("client_id, close_lead_id").in("client_id", clientIds),
    admin.from("close_leads").select("client_id, id").in("client_id", clientIds),
    admin.from("kunde_close_deals").select("kunde_id, close_lead_id").in("kunde_id", clientIds),
  ]);
  const stored = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, c: string, l: string | null) => { if (!l) return; if (!m.has(c)) m.set(c, new Set()); m.get(c)!.add(l); };
  (l1 || []).forEach((r: any) => add(stored, r.client_id, r.close_lead_id));
  (l2 || []).forEach((r: any) => add(stored, r.client_id, r.id));
  (l3 || []).forEach((r: any) => add(stored, r.kunde_id, r.close_lead_id));

  // The checkin type lives in a specific Close account: verify stored lead ids exist there,
  // otherwise resolve by exact (normalized) lead name in that account.
  const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const leadsByClient = new Map<string, Set<string>>();
  const nicht_zuordenbar: any[] = [];
  for (const s of snap || []) {
    const name: string = s.clients?.name ?? "";
    for (const l of stored.get(s.client_id) ?? []) {
      const lead = await get(`/lead/${encodeURIComponent(l)}/?_fields=id`);
      if (lead?.id) add(leadsByClient, s.client_id, lead.id);
    }
    if (!leadsByClient.has(s.client_id) && name) {
      const res = await get(`/lead/?query=${encodeURIComponent(`name:"${name.replace(/"/g, "")}"`)}&_fields=id,display_name,name&_limit=25`);
      for (const ld of res.data || []) {
        if (norm(ld.display_name || ld.name || "") === norm(name)) add(leadsByClient, s.client_id, ld.id);
      }
    }
    if (!leadsByClient.has(s.client_id)) nicht_zuordenbar.push({ client_id: s.client_id, name: name || null, grund: stored.has(s.client_id) ? "Verknüpfter Lead nicht im Close-Account mit Client-Checkins, kein Lead mit exakt gleichem Namen" : "Keine Close-Verknüpfung und kein Lead mit exakt gleichem Namen" });
  }

  const von = monat, bis = nextMonth(monat);
  const rows: any[] = [];
  let fremde = 0, entwuerfe = 0;
  for (const [clientId, leads] of leadsByClient) {
    for (const leadId of leads) {
      let skip = 0;
      while (true) {
        const page = await get(`/activity/custom/?lead_id=${encodeURIComponent(leadId)}&custom_activity_type_id=${ACTIVITY_TYPE_ID}&_limit=100&_skip=${skip}`);
        for (const a of page.data || []) {
          const when = a.activity_at || a.date_created;
          const d = when ? berlinDate(when) : null;
          if (!d || d < von || d >= bis) continue;
          if (a.status && a.status !== "published") { entwuerfe++; continue; }
          if (a.user_id !== closeUserId) { fremde++; continue; }
          const fa = fields.faellig ? str(a[fields.faellig]) : null;
          rows.push({
            close_activity_id: a.id, monat, client_id: clientId, mitarbeiter_id, quelle: "close", datum: d,
            stimmung: str(a[fields.stimmung!]), anlass: str(a[fields.anlass!]),
            kampagne_nach_erwartung: fields.kampagne ? str(a[fields.kampagne]) : null,
            upsell_potenzial: fields.upsell ? str(a[fields.upsell]) : null,
            naechster_schritt: fields.schritt ? str(a[fields.schritt]) : null,
            offene_punkte: fields.offen ? str(a[fields.offen]) : null,
            naechster_checkin_faellig: fa && /^\d{4}-\d{2}-\d{2}/.test(fa) ? fa.slice(0, 10) : null,
            close_lead_id: leadId, close_user_id: a.user_id, updated_at: new Date().toISOString(),
          });
        }
        if (!page.has_more) break;
        skip += 100;
      }
    }
  }
  // Cross-check: all checkins of this user in the month account-wide, to surface calls on leads we could not map.
  const mapped = new Set([...leadsByClient.values()].flatMap((x) => [...x]));
  const ohne_kunde: any[] = [];
  let skip2 = 0;
  while (true) {
    const page = await get(`/activity/?user_id=${closeUserId}&date_created__gte=${von}T00:00:00&_limit=100&_skip=${skip2}`);
    for (const a of page.data || []) {
      const when = a.activity_at || a.date_created;
      const d = when ? berlinDate(when) : null;
      if (a.custom_activity_type_id !== ACTIVITY_TYPE_ID) continue;
      if (!d || d < von || d >= bis || a.user_id !== closeUserId) continue;
      if (!mapped.has(a.lead_id)) ohne_kunde.push({ activity_id: a.id, lead_id: a.lead_id, datum: d });
    }
    if (!page.has_more) break;
    skip2 += 100;
  }
  for (const o of ohne_kunde) {
    const ld = await get(`/lead/${encodeURIComponent(o.lead_id)}/?_fields=id,display_name`);
    o.lead_name = ld?.display_name ?? null;
  }

  // dedupe (same activity reachable via two lead links)
  const uniq = [...new Map(rows.map((r) => [r.close_activity_id, r])).values()];

  // Everything fetched successfully — only now touch the database.
  const { data: existing } = await admin.from("bonus_checkins").select("close_activity_id").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id).eq("quelle", "close");
  const before = new Set((existing || []).map((e: any) => e.close_activity_id));
  if (uniq.length) {
    const { error } = await admin.from("bonus_checkins").upsert(uniq, { onConflict: "close_activity_id" });
    if (error) throw new Error("Schreiben fehlgeschlagen: " + error.message);
  }
  const found = new Set(uniq.map((r) => r.close_activity_id));
  const stale = [...before].filter((id) => !found.has(id));
  if (stale.length) {
    const { error } = await admin.from("bonus_checkins").delete().in("close_activity_id", stale);
    if (error) throw new Error("Bereinigen fehlgeschlagen: " + error.message);
  }
  const neu = uniq.filter((r) => !before.has(r.close_activity_id)).length;
  return { gefunden: uniq.length, neu, aktualisiert: uniq.length - neu, entfernt: stale.length, nicht_zuordenbar, ignoriert_andere_nutzer: fremde, ignoriert_entwuerfe: entwuerfe, calls_ohne_snapshot_kunde: ohne_kunde };
}

async function runLogged(admin: any, get: any, fields: Fields | null, monat: string, mitarbeiter_id: string, ausloeser: string) {
  const { data: log } = await admin.from("bonus_sync_log").insert({ sync_typ: "checkins", ausloeser, monat, mitarbeiter_id }).select("id").single();
  try {
    const f = fields ?? await resolveFields(get);
    const r = await syncOne(admin, get, f, monat, mitarbeiter_id);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: true, gefunden: r.gefunden, neu: r.neu, aktualisiert: r.aktualisiert, entfernt: r.entfernt, nicht_zuordenbar: r.nicht_zuordenbar, calls_ohne_snapshot_kunde: r.calls_ohne_snapshot_kunde }).eq("id", log.id);
    return { ok: true, monat, mitarbeiter_id, ...r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bonus-checkins-sync failed", { monat, mitarbeiter_id, msg });
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: false, fehler: msg }).eq("id", log.id);
    return { ok: false, monat, mitarbeiter_id, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Use whichever configured Close account actually contains the "Client Checkin" activity type.
  let get: ((p: string) => Promise<any>) | null = null;
  const probe: string[] = [];
  for (const name of ["CLOSE_API_KEY", "CLOSE_API_KEY_SALES"]) {
    const k = Deno.env.get(name);
    if (!k) { probe.push(`${name}: nicht gesetzt`); continue; }
    const g = closeClient(k);
    try {
      const l = await g(`/custom_activity/`);
      if ((l.data || []).some((x: any) => x.id === ACTIVITY_TYPE_ID)) { get = g; console.log("using", name); break; }
      probe.push(`${name}: Typ nicht vorhanden`);
    } catch (e) { probe.push(`${name}: ${e instanceof Error ? e.message : e}`); }
  }
  if (!get) {
    console.error("no close account with checkin type", probe);
    return json({ ok: false, error: `Kein Close-Account mit Activity-Typ ${ACTIVITY_TYPE_ID} gefunden — ${probe.join(" | ")}` }, 502);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body allowed for cron */ }

  // Cron mode: internal token, current month, all active employees
  const cronTok = req.headers.get("x-cron-token");
  if (cronTok) {
    const { data: t } = await admin.from("bonus_cron_tokens").select("token").eq("name", "bonus_checkins_sync").maybeSingle();
    if (!t?.token || t.token !== cronTok) { console.warn("cron token rejected"); return json({ error: "unauthorized" }, 401); }
    const monat = currentMonthBerlin();
    const { data: mas } = await admin.from("bonus_mitarbeiter").select("id").eq("aktiv", true);
    const results = [];
    for (const m of mas || []) results.push(await runLogged(admin, get, null, monat, m.id, "cron"));
    return json({ ok: results.every((r) => r.ok), results }, results.every((r) => r.ok) ? 200 : 502);
  }

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: canManage } = await userClient.rpc("bonus_can_manage");
  if (!canManage) return json({ error: "forbidden" }, 403);

  const monat = String(body?.monat || "");
  const mitarbeiter_id = String(body?.mitarbeiter_id || "");
  if (!/^\d{4}-\d{2}-01$/.test(monat)) return json({ error: "monat muss YYYY-MM-01 sein" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(mitarbeiter_id)) return json({ error: "mitarbeiter_id ungültig" }, 400);

  const r = await runLogged(admin, get, null, monat, mitarbeiter_id, "manuell");
  return json(r, r.ok ? 200 : 502);
});
