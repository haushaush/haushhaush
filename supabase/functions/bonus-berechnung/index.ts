// Single source of truth for the bonus math (used by the cockpit and later the Slack report).
// All tiers come from bonus_config — nothing is hardcoded here.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Tier = { von?: number; bis?: number; ab?: number; unter?: number; ueber?: number; punkte: number };
type Status = "ok" | "keine_daten" | "unvollstaendig";
type Krit = { status: Status; punkte: number | null; max: number; wert: Record<string, unknown>; hinweis?: string; basis_hinweis?: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

function matches(t: Tier, v: number) {
  if (t.von !== undefined && v < t.von) return false;
  if (t.bis !== undefined && v > t.bis) return false;
  if (t.ab !== undefined && v < t.ab) return false;
  if (t.unter !== undefined && v >= t.unter) return false;
  if (t.ueber !== undefined && v <= t.ueber) return false;
  return true;
}
function lower(t: Tier) { return t.von ?? t.ab ?? t.ueber ?? -Infinity; }
export function tierPoints(staffel: Tier[], v: number): number {
  const hit = staffel.find((t) => matches(t, v));
  if (hit) return hit.punkte;
  // value falls into a gap between tiers (e.g. 20.5 between "bis 20" and "von 21"): take the highest tier whose lower bound is <= v
  const cands = staffel.filter((t) => lower(t) <= v).sort((a, b) => lower(b) - lower(a));
  return cands[0]?.punkte ?? 0;
}
const prevMonth = (m: string) => { const d = new Date(m + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const monat = String(body?.monat || "");
  const mitarbeiter_id = String(body?.mitarbeiter_id || "");
  const speichern = body?.speichern === true;
  if (!/^\d{4}-\d{2}-01$/.test(monat)) return json({ error: "monat muss YYYY-MM-01 sein" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(mitarbeiter_id)) return json({ error: "mitarbeiter_id ungültig" }, 400);

  const { data: canManage } = await userClient.rpc("bonus_can_manage");
  if (!canManage) {
    const { data: own } = await userClient.rpc("bonus_is_own", { _mitarbeiter_id: mitarbeiter_id });
    if (!own) return json({ error: "forbidden" }, 403);
    if (speichern) return json({ error: "Nur Admins dürfen speichern" }, 403);
  }

  const { data: cfgRow, error: cErr } = await admin.from("bonus_config").select("config, gueltig_ab")
    .eq("mitarbeiter_id", mitarbeiter_id).lte("gueltig_ab", monat).order("gueltig_ab", { ascending: false }).limit(1).maybeSingle();
  if (cErr) return json({ error: cErr.message }, 500);
  if (!cfgRow) return json({ error: "Keine bonus_config für diesen Monat gefunden" }, 404);
  const cfg: any = cfgRow.config;
  const max = cfg.punkte_max;

  // ---------- 1) Zufriedenheit ----------
  const { data: tokens, error: tErr } = await admin.from("bonus_survey_tokens").select("token, versendet_am, ausgefuellt_am").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  if (tErr) return json({ error: tErr.message }, 500);
  const sent = (tokens || []).filter((t) => t.versendet_am);
  const filled = sent.filter((t) => t.ausgefuellt_am);
  let k1: Krit;
  if (!tokens?.length) k1 = { status: "keine_daten", punkte: null, max: max.zufriedenheit, wert: {}, hinweis: "Für diesen Monat wurden keine Umfrage-Tokens erzeugt." };
  else if (!sent.length) k1 = { status: "unvollstaendig", punkte: null, max: max.zufriedenheit, wert: { tokens: tokens.length }, hinweis: "Tokens vorhanden, aber noch keiner als versendet markiert." };
  else {
    const z = cfg.zufriedenheit;
    // ONLY score_betreuung — score_leistung must never be used for points.
    const field = "score_betreuung";
    const { data: ans, error: aErr } = await admin.from("bonus_survey_antworten").select(field).in("token", filled.map((t) => t.token));
    if (aErr) return json({ error: aErr.message }, 500);
    const quote = (filled.length / sent.length) * 100;
    const avg = ans?.length ? ans.reduce((s: number, a: any) => s + Number(a[field]), 0) / ans.length : null;
    const qOk = quote >= z.ausfuellquote_schwelle;
    const aOk = avg !== null && avg > z.durchschnitt_schwelle;
    const p = qOk && aOk ? tierPoints(z.staffel, avg!) : qOk ? z.pauschale_quote_ok_schnitt_niedrig : aOk ? z.pauschale_quote_niedrig_schnitt_ok : z.pauschale_beides_niedrig;
    k1 = { status: "ok", punkte: p, max: max.zufriedenheit, wert: { versendet: sent.length, ausgefuellt: filled.length, ausfuellquote: r2(quote), durchschnitt_score_betreuung: avg === null ? null : r2(avg) } };
  }

  // ---------- 2/3) Cash Collect ----------
  const cashSum = async (m: string) => {
    const { data, error } = await admin.from("bonus_cash_collect").select("betrag, zugeordnet").eq("monat", m).eq("mitarbeiter_id", mitarbeiter_id);
    if (error) throw error;
    const rows = data || [];
    return { rows: rows.length, zugeordnet: rows.filter((r) => r.zugeordnet).length, summe: r2(rows.filter((r) => r.zugeordnet).reduce((s, r) => s + Number(r.betrag), 0)) };
  };
  // Unassigned payments (mitarbeiter_id null) for the month, as clarification count
  const { count: offeneZuordnung } = await admin.from("bonus_cash_collect").select("id", { count: "exact", head: true }).eq("monat", monat).eq("zugeordnet", false);
  const cur = await cashSum(monat);
  const refMonth = cfg.cash_entwicklung?.referenz_erster_monat && prevMonth(monat) === cfg.cash_entwicklung.referenz_erster_monat ? cfg.cash_entwicklung.referenz_erster_monat : prevMonth(monat);
  const prev = await cashSum(refMonth);

  let k2: Krit;
  if (!cur.rows) k2 = { status: "keine_daten", punkte: null, max: max.cash_niveau, wert: {}, hinweis: "Keine Zahlungseingänge für diesen Monat erfasst." };
  else if (!cur.zugeordnet) k2 = { status: "unvollstaendig", punkte: null, max: max.cash_niveau, wert: { eingaenge: cur.rows }, hinweis: "Zahlungseingänge vorhanden, aber keiner zugeordnet." };
  else k2 = { status: "ok", punkte: tierPoints(cfg.cash_niveau.staffel, cur.summe), max: max.cash_niveau, wert: { summe_eur: cur.summe, eingaenge: cur.rows, zugeordnet: cur.zugeordnet, offene_zuordnung: offeneZuordnung ?? 0 } };

  let k3: Krit;
  if (!cur.rows) k3 = { status: "keine_daten", punkte: null, max: max.cash_entwicklung, wert: { referenzmonat: refMonth }, hinweis: "Keine Zahlungseingänge für diesen Monat erfasst." };
  else if (k2.status !== "ok" || !prev.zugeordnet || prev.summe <= 0) k3 = { status: "unvollstaendig", punkte: null, max: max.cash_entwicklung, wert: { referenzmonat: refMonth, summe_eur: cur.summe, vormonat_eur: prev.summe }, hinweis: `Kein belastbarer Referenzwert für ${refMonth}.` };
  else {
    const pct = ((cur.summe - prev.summe) / prev.summe) * 100;
    k3 = { status: "ok", punkte: tierPoints(cfg.cash_entwicklung.staffel, pct), max: max.cash_entwicklung, wert: { referenzmonat: refMonth, summe_eur: cur.summe, vormonat_eur: prev.summe, veraenderung_prozent: r2(pct) } };
  }

  // ---------- 4) Churn ----------
  const { count: snapCount } = await admin.from("bonus_kunden_snapshot").select("id", { count: "exact", head: true }).eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  const { data: churn, error: chErr } = await admin.from("bonus_churn_events").select("zaehlt_als_churn").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  if (chErr) return json({ error: chErr.message }, 500);
  // An empty churn table means "nothing recorded", not "no churn" — only score once someone confirmed the capture is complete.
  const { data: frg } = await admin.from("bonus_monat_freigaben").select("churn_erfassung_abgeschlossen, churn_bestaetigt_am").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id).maybeSingle();
  const bestaetigt = frg?.churn_erfassung_abgeschlossen === true;
  let k4: Krit;
  if (!snapCount) k4 = { status: "keine_daten", punkte: null, max: max.churn, wert: { erfassung_bestaetigt: bestaetigt }, hinweis: "Kein Kundensnapshot zum Monatsersten — Nenner fehlt." };
  else if (!bestaetigt) k4 = { status: "keine_daten", punkte: null, max: max.churn, wert: { erfassung_bestaetigt: false, betreute_kunden: snapCount, churn_ereignisse: churn?.length ?? 0 }, hinweis: "Churn-Erfassung für diesen Monat noch nicht bestätigt" };
  else {
    const z = (churn || []).filter((c) => c.zaehlt_als_churn).length;
    const q = (z / snapCount) * 100;
    k4 = { status: "ok", punkte: tierPoints(cfg.churn.staffel, q), max: max.churn, wert: { erfassung_bestaetigt: true, bestaetigt_am: frg?.churn_bestaetigt_am, betreute_kunden: snapCount, churn_ereignisse: churn?.length ?? 0, zaehlt_als_churn: z, churn_quote: r2(q) } };
  }

  // ---------- 5) Calls (gewichtete Betreuungsabdeckung) ----------
  // 0 calls is only a real statement if the Close sync completed for this month; a failed latest run blocks scoring.
  const cc = cfg.calls || {};
  const { data: ciRows, error: ciErr } = await admin.from("bonus_checkins").select("close_activity_id, client_id, datum").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id).order("datum").order("close_activity_id");
  if (ciErr) return json({ error: ciErr.message }, 500);
  const calls = ciRows?.length ?? 0;
  const gew: number[] = Array.isArray(cc.gewichtung_je_kunde_woche) && cc.gewichtung_je_kunde_woche.length ? cc.gewichtung_je_kunde_woche.map(Number) : [1];
  const isoWeek = (s: string) => {
    const d = new Date(String(s).slice(0, 10) + "T00:00:00Z");
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    const y = d.getUTCFullYear(); const w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
    return `${y}-KW${String(w).padStart(2, "0")}`;
  };
  const perKW = new Map<string, number>();
  const wochenMap = new Map<string, { kunden: Set<string>; summe: number; checkins: number }>();
  const gewichte: Record<string, { gewicht: number; nr_in_woche: number; woche: string }> = {};
  let gewSumme = 0, abgewertet = 0;
  const kundenMit = new Set<string>();
  for (const r of ciRows || []) {
    const key = r.client_id ?? `ohne:${r.close_activity_id}`;
    const woche = isoWeek(r.datum);
    const n = perKW.get(`${key}|${woche}`) ?? 0;
    perKW.set(`${key}|${woche}`, n + 1);
    const g = gew[Math.min(n, gew.length - 1)];
    if (n > 0 && g < gew[0]) abgewertet++;
    gewSumme += g; kundenMit.add(key);
    const wm = wochenMap.get(woche) ?? { kunden: new Set(), summe: 0, checkins: 0 };
    wm.kunden.add(key); wm.summe += g; wm.checkins++; wochenMap.set(woche, wm);
    if (r.close_activity_id) gewichte[r.close_activity_id] = { gewicht: g, nr_in_woche: n + 1, woche };
  }
  const wochen = [...wochenMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([woche, v]) => ({ woche, kunden_erreicht: v.kunden.size, checkins: v.checkins, gewichtete_summe: r2(v.summe) }));
  const zielwert = snapCount ?? 0;
  const grad = zielwert > 0 ? (gewSumme / zielwert) * 100 : null;
  const callWert = { modus: cc.modus ?? null, anzahl_calls: calls, eindeutige_kunden: kundenMit.size, gewichtete_summe: r2(gewSumme), zielwert, erreichungsgrad_prozent: grad === null ? null : r2(grad), abgewertete_checkins: abgewertet, wochen, gewichte };
  const { data: syncLogs } = await admin.from("bonus_sync_log").select("ok, beendet_am, fehler, nicht_zuordenbar").eq("sync_typ", "checkins").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id).not("ok", "is", null).order("gestartet_am", { ascending: false }).limit(1);
  const lastSync = syncLogs?.[0];
  const nz = Array.isArray(lastSync?.nicht_zuordenbar) ? lastSync.nicht_zuordenbar.length : 0;
  let k5: Krit;
  if (lastSync && lastSync.ok === false) {
    k5 = { status: "unvollstaendig", punkte: null, max: max.calls, wert: { ...callWert, letzter_sync: lastSync.beendet_am, sync_fehler: lastSync.fehler }, hinweis: "Letzter Close-Sync fehlgeschlagen — Call-Zahl nicht belastbar." };
  } else if (lastSync && nz > 0) {
    k5 = { status: "unvollstaendig", punkte: null, max: max.calls, wert: { ...callWert, letzter_sync: lastSync.beendet_am, nicht_zuordenbare_kunden: nz }, hinweis: `${nz} betreute Kunden sind in Close nicht zuordenbar — ihre Calls können fehlen, daher keine Punkte.` };
  } else if (!lastSync && !calls) {
    k5 = { status: "keine_daten", punkte: null, max: max.calls, wert: callWert, hinweis: "Checkup-Calls noch nicht aus Close synchronisiert." };
  } else if (grad === null) {
    k5 = { status: "keine_daten", punkte: null, max: max.calls, wert: callWert, hinweis: "Kein Kundensnapshot — Zielwert fehlt." };
  } else {
    k5 = { status: "ok", punkte: Math.min(tierPoints(cc.staffel, grad), max.calls), max: max.calls,
      wert: { ...callWert, letzter_sync: lastSync?.beendet_am ?? null, nicht_zuordenbare_kunden: 0 } };
  }

  // The observed coverage earns configured points even with incomplete mappings;
  // completeness remains separate and must be acknowledged when approving.
  k5.punkte = grad === null ? 0 : Math.min(tierPoints(cc.staffel, grad), max.calls);

  // ---------- Upsell ----------
  const { data: ups } = await admin.from("bonus_upsells").select("id").eq("mitarbeiter_id", mitarbeiter_id);
  let upsell = 0;
  if (ups?.length) {
    const { data: zz } = await admin.from("bonus_upsell_zahlungen").select("beteiligung").eq("monat", monat).eq("storniert", false).in("upsell_id", ups.map((x) => x.id));
    upsell = r2((zz || []).reduce((s, x) => s + Number(x.beteiligung), 0));
  }

  const kriterien = { zufriedenheit: k1, cash_niveau: k2, cash_entwicklung: k3, churn: k4, calls: k5 };
  const basis: Record<keyof typeof kriterien, string> = {
    zufriedenheit: 'Basis: noch keine Funnel-Versände erfasst',
    cash_niveau: cur.rows ? 'Basis: Zahlungseingänge noch nicht zugeordnet' : 'Basis: Zahlungsabgleich noch nicht angebunden',
    cash_entwicklung: !cur.rows ? 'Basis: Zahlungsabgleich noch nicht angebunden' : `Basis: Referenzwert für ${refMonth} noch nicht vollständig`,
    churn: !snapCount ? 'Basis: Kundensnapshot noch nicht erfasst' : 'Basis: Churn-Erfassung für diesen Monat nicht bestätigt',
    calls: lastSync?.ok === false ? 'Basis: letzter Close-Abgleich nicht abgeschlossen' : nz > 0 ? `Basis: ${Math.max(0, zielwert - nz)} von ${zielwert} Kunden in Close erreichbar` : !zielwert ? 'Basis: Kundensnapshot noch nicht erfasst' : 'Basis: noch kein vollständiger Close-Abgleich',
  };
  for (const key of Object.keys(kriterien) as (keyof typeof kriterien)[]) {
    const k = kriterien[key];
    k.punkte = k.punkte ?? 0;
    k.basis_hinweis = k.status === 'ok' ? null : basis[key];
  }
  const okList = Object.values(kriterien).filter((k) => k.status === "ok");
  const punkte = r2(Object.values(kriterien).reduce((s, k) => s + (k.punkte ?? 0), 0));
  const bewertbar = okList.reduce((s, k) => s + k.max, 0);
  const gesamtMax = Object.values(kriterien).reduce((s, k) => s + k.max, 0);
  const bonus = r2(Math.min(punkte * cfg.bonus_pro_punkt_eur, cfg.bonus_max_eur));

  const result = {
    monat, mitarbeiter_id, config_gueltig_ab: cfgRow.gueltig_ab, kriterien,
    punkte_gesamt: punkte, punkte_bewertbar_max: bewertbar, punkte_max: gesamtMax,
    nicht_bewertbare_kriterien: 5 - okList.length,
    bonus_eur: bonus, upsell_beteiligung_eur: upsell, berechnet_am: new Date().toISOString(),
  };

  if (speichern) {
    const { data: ex } = await admin.from("bonus_monate").select("status").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id).maybeSingle();
    if (ex?.status === "freigegeben") return json({ error: "Monat ist bereits freigegeben und wird nicht überschrieben", ...result }, 409);
    const { error: sErr } = await admin.from("bonus_monate").upsert({
      monat, mitarbeiter_id,
      p1_zufriedenheit: k1.punkte ?? 0, p2_cash_niveau: k2.punkte ?? 0, p3_cash_entwicklung: k3.punkte ?? 0,
      p4_churn: k4.punkte ?? 0, p5_calls: k5.punkte ?? 0,
      punkte_gesamt: punkte, bonus_eur: bonus, upsell_beteiligung_eur: upsell,
      status: "offen", berechnungsdetails: result, updated_at: new Date().toISOString(),
    }, { onConflict: "monat,mitarbeiter_id" });
    if (sErr) return json({ error: sErr.message }, 500);
  }
  return json(result);
});
