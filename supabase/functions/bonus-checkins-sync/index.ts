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

/** All leads on which this Close user logged a Client Checkin in the window (Advanced Filtering — the only
 *  Close endpoint that can search activities by user without a lead_id). */
async function leadsWithCheckins(post: (p: string, b: unknown) => Promise<any>, closeUserId: string, vonIso: string, bisIso: string) {
  const out: any[] = [];
  let cursor: string | null = null;
  do {
    const page = await post(`/data/search/`, {
      query: { type: "and", queries: [
        { type: "object_type", object_type: "lead" },
        { type: "has_related", this_object_type: "lead", related_object_type: "activity.custom_activity", related_query: { type: "and", queries: [
          { type: "field_condition", field: { type: "regular_field", object_type: "activity.custom_activity", field_name: "custom_activity_type_id" }, condition: { type: "reference", reference_type: "custom_activity_type", object_ids: [ACTIVITY_TYPE_ID] } },
          { type: "field_condition", field: { type: "regular_field", object_type: "activity.custom_activity", field_name: "user_id" }, condition: { type: "reference", reference_type: "user_or_group", object_ids: [closeUserId] } },
          { type: "field_condition", field: { type: "regular_field", object_type: "activity.custom_activity", field_name: "activity_at" }, condition: { type: "moment_range", on_or_after: { type: "fixed_utc", value: vonIso }, before: { type: "fixed_utc", value: bisIso } } },
        ] } },
      ] },
      _fields: { lead: ["id", "display_name", "status_label"] }, _limit: 200, ...(cursor ? { cursor } : {}),
    });
    out.push(...(page.data || []));
    cursor = page.cursor || null;
  } while (cursor);
  return out;
}

async function syncOne(admin: any, get: (p: string) => Promise<any>, post: (p: string, b: unknown) => Promise<any>, fields: Fields, monat: string, mitarbeiter_id: string) {
  const { data: ma, error: mErr } = await admin.from("bonus_mitarbeiter").select("id, close_user_id").eq("id", mitarbeiter_id).maybeSingle();
  if (mErr || !ma) throw new Error("bonus_mitarbeiter nicht gefunden");
  const closeUserId: string | null = ma.close_user_id ?? null;
  if (!closeUserId) throw new Error("Keine Close-User-ID für den Mitarbeiter hinterlegt (bonus_mitarbeiter.close_user_id)");

  const { data: snap, error: sErr } = await admin.from("bonus_kunden_snapshot").select("client_id, clients:client_id(name)").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  if (sErr) throw new Error("Snapshot: " + sErr.message);
  if (!(snap || []).length) throw new Error("Kein Kundensnapshot für diesen Monat — ohne Nenner kein Sync");
  const inSnap = new Set((snap || []).map((s: any) => s.client_id));

  // Only source of lead ids: the Close-mirrored customer list. No name search.
  const { data: akt, error: aErr } = await admin.from("bonus_kunden_aktuell").select("close_lead_id, client_id, zaehlt_fuer_betreuung, close_status_label").eq("close_account", "CLOSE_API_KEY_SALES");
  if (aErr) throw new Error("Kundenliste: " + aErr.message);
  const leadInfo = new Map((akt || []).map((a: any) => [a.close_lead_id, a]));
  const mapped = new Set((akt || []).filter((a: any) => a.client_id).map((a: any) => a.client_id));
  const nicht_zuordenbar = (snap || []).filter((s: any) => !mapped.has(s.client_id)).map((s: any) => ({ client_id: s.client_id, name: s.clients?.name ?? null, grund: "Kunde steht im Snapshot, aber auf keinem Close-Lead mit Klienten-Status" }));

  const von = monat, bis = nextMonth(monat);
  // Berlin month boundaries in UTC, padded by a day; exact filtering happens below on the Berlin date.
  const pad = (d: string, h: number) => new Date(new Date(d + "T00:00:00Z").getTime() + h * 3600e3).toISOString();
  const leads = await leadsWithCheckins(post, closeUserId, pad(von, -24), pad(bis, 24));

  const rows: any[] = [], kandidaten: any[] = [];
  let fremde = 0, entwuerfe = 0, ausgeschlossen = 0;
  for (const lead of leads) {
    const info: any = leadInfo.get(lead.id);
    const counts = info?.client_id && info.zaehlt_fuer_betreuung && inSnap.has(info.client_id);
    if (info && !info.zaehlt_fuer_betreuung) { ausgeschlossen++; continue; }
    let skip = 0;
    while (true) {
      const page = await get(`/activity/custom/?lead_id=${encodeURIComponent(lead.id)}&custom_activity_type_id=${ACTIVITY_TYPE_ID}&_limit=100&_skip=${skip}`);
      for (const a of page.data || []) {
        const when = a.activity_at || a.date_created;
        const d = when ? berlinDate(when) : null;
        if (!d || d < von || d >= bis) continue;
        if (a.status && a.status !== "published") { entwuerfe++; continue; }
        if (a.user_id !== closeUserId) { fremde++; continue; }
        if (!counts) {
          kandidaten.push({ close_activity_id: a.id, close_lead_id: lead.id, lead_name: lead.display_name, close_status_label: lead.status_label, datum: d, monat, mitarbeiter_id, updated_at: new Date().toISOString() });
          continue;
        }
        const fa = fields.faellig ? str(a[fields.faellig]) : null;
        rows.push({
          close_activity_id: a.id, monat, client_id: info.client_id, mitarbeiter_id, quelle: "close", datum: d,
          stimmung: str(a[fields.stimmung!]), anlass: str(a[fields.anlass!]),
          kampagne_nach_erwartung: fields.kampagne ? str(a[fields.kampagne]) : null,
          upsell_potenzial: fields.upsell ? str(a[fields.upsell]) : null,
          naechster_schritt: fields.schritt ? str(a[fields.schritt]) : null,
          offene_punkte: fields.offen ? str(a[fields.offen]) : null,
          naechster_checkin_faellig: fa && /^\d{4}-\d{2}-\d{2}/.test(fa) ? fa.slice(0, 10) : null,
          close_lead_id: lead.id, close_user_id: a.user_id, updated_at: new Date().toISOString(),
        });
      }
      if (!page.has_more) break;
      skip += 100;
    }
  }
  const uniq = [...new Map(rows.map((r) => [r.close_activity_id, r])).values()];
  if (kandidaten.length) {
    // keep a human decision (ignoriert/uebernommen); only refresh descriptive fields
    const { data: known } = await admin.from("bonus_checkin_kandidaten").select("close_activity_id").in("close_activity_id", kandidaten.map((k) => k.close_activity_id));
    const k = new Set((known || []).map((x: any) => x.close_activity_id));
    const fresh = kandidaten.filter((x) => !k.has(x.close_activity_id));
    if (fresh.length) { const { error } = await admin.from("bonus_checkin_kandidaten").insert(fresh); if (error) throw new Error("Kandidaten schreiben: " + error.message); }
    for (const x of kandidaten.filter((x) => k.has(x.close_activity_id))) await admin.from("bonus_checkin_kandidaten").update({ close_status_label: x.close_status_label, lead_name: x.lead_name, datum: x.datum }).eq("close_activity_id", x.close_activity_id);
  }

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
  return { gefunden: uniq.length, neu, aktualisiert: uniq.length - neu, entfernt: stale.length, nicht_zuordenbar, ignoriert_andere_nutzer: fremde, ignoriert_entwuerfe: entwuerfe };
}

async function runLogged(admin: any, get: any, fields: Fields | null, monat: string, mitarbeiter_id: string, ausloeser: string) {
  const { data: log } = await admin.from("bonus_sync_log").insert({ sync_typ: "checkins", ausloeser, monat, mitarbeiter_id }).select("id").single();
  try {
    const f = fields ?? await resolveFields(get);
    const r = await syncOne(admin, get, f, monat, mitarbeiter_id);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: true, gefunden: r.gefunden, neu: r.neu, aktualisiert: r.aktualisiert, entfernt: r.entfernt, nicht_zuordenbar: r.nicht_zuordenbar }).eq("id", log.id);
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
  // Client Checkins and the mirrored customer list both live in the Haush Haush Digital account.
  const key = Deno.env.get("CLOSE_API_KEY_SALES");
  if (!key) return json({ ok: false, error: "CLOSE_API_KEY_SALES ist nicht gesetzt" }, 502);
  const get = closeClient(key);
  const shared = sharedClose(key);
  const post = (p: string, b: unknown) => shared(p, "POST", b).catch((e: unknown) => { throw new CloseError(e instanceof Error ? e.message : String(e)); });

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
