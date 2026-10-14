// Admin-only input mask for runtimes: writes ONE customer's won "Sales" opportunity in Close (update or create),
// then re-reads it from Close and re-derives the runtime. Nothing is stored locally that Close did not accept.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { closeForPipeline, cors, json, SALES_PIPELINE_ID } from "../_shared/bonusClose.ts";
import { addMonths, CF, mapContext, mapOpp, pushNotion, syncLaufzeiten } from "../_shared/closeAbschluesse.ts";

const CASH_TYPE = "actitype_0lwRdK0dAAXgtFwpWwaFpb";
const PAKET_CF = "cf_TQANvWAP5zk8A4txB6sevhXk78NhilRk4D2wPsHOXhc";
const WON_STATUS = "stat_TnbrEeuraONf6CgFJEnl9JkRciAQB5gqAmc91eUPEMB";
const Body = z.object({
  client_id: z.string().uuid(),
  close_opportunity_id: z.string().max(100).nullable().optional(),
  startdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  laufzeit_monate: z.number().int().min(1).max(120).nullable().optional(),
  abschlusswert: z.number().min(0).max(10_000_000).nullable().optional(),
  retainer_monat: z.number().min(0).max(1_000_000).nullable().optional(),
  leistungen: z.array(z.string().max(200)).max(50).nullable().optional(),
  deal_typ: z.string().max(100).nullable().optional(),
  paket: z.string().max(100).nullable().optional(),
  optionen: z.boolean().optional(), // read-only: choices from Close + cash-collect activity per active lead
  anlegen_bestaetigt: z.boolean().optional(),
  pruefen: z.boolean().optional(), // dry run: resolves everything, writes nothing
});
const FELDER = ["startdatum", "laufzeit_monate", "abschlusswert", "retainer_monat", "leistungen", "deal_typ"] as const;

// Coerce a value to what the Close field type expects; refuse instead of guessing.
function forField(f: any, v: any, label: string) {
  const t = f?.type;
  if (t === "number") return Number(v);
  if (t === "date") return String(v);
  if (t === "text" || t === "textarea" || !t) return String(v);
  if (t === "choices" && Array.isArray(v)) {
    if (!f.accepts_multiple_values) throw new Error(`Close-Feld „${f.name}" erlaubt nur einen Wert.`);
    return v.map((x) => forField({ ...f, accepts_multiple_values: false }, x, label));
  }
  if (t === "choices") {
    const c = (f.choices || []).find((x: string) => String(x).trim() === String(v));
    if (!c) throw new Error(`Close-Feld „${f.name}" erlaubt nur ${(f.choices || []).join(", ")} – „${v}" für ${label} passt nicht.`);
    return c;
  }
  throw new Error(`Close-Feld „${f.name}" hat den Typ ${t}, ${label} kann dort nicht sicher geschrieben werden.`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Nicht angemeldet." }, 401);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Nur Admins dürfen Abschlüsse in Close schreiben." }, 403);

  const rawBody = await req.json().catch(() => null);
  if (rawBody?.optionen) {
    try {
      const { call } = await closeForPipeline();
      const { data: st } = await admin.from("kunden_laufzeit_stand").select("client_id, close_lead_id");
      const [fo, fa, acts] = await Promise.all([
        call(`/custom_field/opportunity/?_limit=200`), call(`/custom_field/activity/?_limit=200`),
        cashActivities(call, (st || []).map((r: any) => r.close_lead_id).filter(Boolean)),
      ]);
      const ch = (list: any, id: string) => ((list.data || []).find((f: any) => f.id === id)?.choices) || [];
      const cash: Record<string, any> = {};
      for (const r of st || []) { const a = acts.get(r.close_lead_id); cash[r.client_id] = a ? { activity_id: a.id, paket: a[`custom.${PAKET_CF}`] ?? null } : null; }
      const opp: Record<string, any> = {};
      const { data: ab } = await admin.from("close_abschluesse").select("close_opportunity_id, leistungen, deal_typ").in("close_opportunity_id", (await admin.from("kunden_laufzeit_stand").select("close_opportunity_id").not("close_opportunity_id", "is", null)).data?.map((x: any) => x.close_opportunity_id) || ["-"]);
      (ab || []).forEach((a: any) => opp[a.close_opportunity_id] = { leistungen: a.leistungen, deal_typ: a.deal_typ });
      return json({ leistungen: ch(fo, CF.leistungen), deal_typ: ch(fo, CF.deal_typ), paket: ch(fa, PAKET_CF), cash, opp,
        mit_cash: Object.values(cash).filter(Boolean).length, ohne_cash: Object.values(cash).filter((x) => !x).length });
    } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 502); }
  }
  if (rawBody?.aktion === "opps" || rawBody?.aktion === "verlaengern" || rawBody?.aktion === "beenden") return lifecycle(admin, u.user, rawBody);
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) return json({ error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;
  const werte: Record<string, any> = {};
  for (const k of FELDER) if (b[k] != null && !(Array.isArray(b[k]) && !(b[k] as any[]).length) && b[k] !== "") werte[k] = b[k];
  if (b.paket) werte.paket = b.paket;
  if (!Object.keys(werte).length) return json({ error: "Kein Wert ausgefüllt." }, 400);

  const { data: stand } = await admin.from("kunden_laufzeit_stand").select("client_id, kunde, close_lead_id, quelle, vc_opportunity_id").eq("client_id", b.client_id).maybeSingle();
  if (!stand?.close_lead_id) return json({ error: "Kunde ist kein aktiver Close-Klient (oder ohne Close-Lead)." }, 404);

  const log = (aktion: string, opp: string | null, fehler: string | null = null) => admin.from("close_abschluss_schreiblog").insert({
    user_id: u.user!.id, user_email: u.user!.email, client_id: stand.client_id, kunde: stand.kunde, close_lead_id: stand.close_lead_id,
    close_opportunity_id: opp, aktion, werte, fehler,
  });

  let oppId: string | null = null;
  try {
    const { call, pipeline } = await closeForPipeline();
    if (!(pipeline.statuses || []).some((s: any) => s.id === WON_STATUS)) throw new Error("Won-Status gehört nicht zur Sales-Pipeline.");
    // Live state in Close decides update vs. create, never the UI's cached view.
    const live = await call(`/opportunity/?lead_id=${encodeURIComponent(stand.close_lead_id)}&_limit=100`);
    const salesIds = new Set((pipeline.statuses || []).map((s: any) => s.id));
    const won = (live.data || []).filter((o: any) => o.status_type === "won" && salesIds.has(o.status_id));
    const fields = await call(`/custom_field/opportunity/?_limit=200`);
    const fById = new Map((fields.data || []).map((f: any) => [f.id, f]));
    const payload: Record<string, any> = {};
    for (const k of FELDER) if (k in werte) payload[`custom.${CF[k]}`] = forField(fById.get(CF[k]), werte[k], k);

    let aktion: "angelegt" | "aktualisiert";
    if (won.length) {
      const target = won.find((o: any) => o.id === b.close_opportunity_id) || (won.length === 1 ? won[0] : null);
      if (!target) throw new Error(`Am Lead gibt es ${won.length} gewonnene Abschlüsse – bitte Seite neu laden und den richtigen bearbeiten.`);
      if (b.close_opportunity_id && b.close_opportunity_id !== target.id) throw new Error("Der angezeigte Abschluss ist in Close nicht (mehr) gewonnen. Bitte Seite neu laden.");
      if (!b.close_opportunity_id && !b.pruefen) throw new Error("In Close existiert inzwischen ein gewonnener Abschluss. Bitte Seite neu laden – es wird nichts doppelt angelegt.");
      oppId = target.id; aktion = "aktualisiert";
      if (b.pruefen) return json({ ok: true, pruefen: true, aktion, close_opportunity_id: oppId, payload });
      if (Object.keys(payload).length) await call(`/opportunity/${oppId}/`, "PUT", payload); // only filled fields → existing values never blanked
    } else {
      aktion = "angelegt";
      if (!Object.keys(payload).length) throw new Error("Für einen neuen Abschluss bitte mindestens Startdatum, Laufzeit, Wert, Retainer oder Leistungen angeben.");
      const dealTyp = forField(fById.get(CF.deal_typ), werte.deal_typ || "Neukunde", "Deal-Typ");
      const create = { lead_id: stand.close_lead_id, status_id: WON_STATUS, ...payload, [`custom.${CF.deal_typ}`]: dealTyp };
      if (b.pruefen) return json({ ok: true, pruefen: true, aktion, payload: create });
      if (!b.anlegen_bestaetigt) return json({ error: `Für ${stand.kunde} würde in Close ein gewonnener Abschluss angelegt – Bestätigung fehlt.` }, 409);
      const created = await call(`/opportunity/`, "POST", create);
      oppId = created.id;
      // Deal known only from Viral Connect → brand the lead in OUR Close (never touch Noah's account); keep a different existing brand.
      if (stand.vc_opportunity_id) {
        const MARKE = "cf_1aHYMjs2T5cmcIWApGI2MVBUDYVsW41UGhFVMboLoQ7";
        const lead = await call(`/lead/${stand.close_lead_id}/?_fields=custom.${MARKE}`);
        const cur = lead[`custom.${MARKE}`];
        if (!cur) { await call(`/lead/${stand.close_lead_id}/`, "PUT", { [`custom.${MARKE}`]: "Viral Connect" }); werte.marke_gesetzt = "Viral Connect"; }
        else werte.marke_unveraendert = cur;
      }
    }
    // Package lives on the customer's "LS Cash Collect" activity; update it if one exists, never create one.
    let paket: any = null;
    if (werte.paket) {
      const act = (await cashActivities(call, [stand.close_lead_id])).get(stand.close_lead_id);
      if (!act) { paket = { gesetzt: false, hinweis: `Für ${stand.kunde} existiert keine Cash-Collect-Aktivität — Paket kann nicht gesetzt werden.` }; delete werte.paket; werte.paket_nicht_gesetzt = b.paket; }
      else {
        const fa = await call(`/custom_field/activity/${PAKET_CF}/`);
        try { await call(`/activity/custom/${act.id}/`, "PUT", { [`custom.${PAKET_CF}`]: forField(fa, werte.paket, "Paket") }); paket = { gesetzt: true }; }
        catch (e) { paket = { gesetzt: false, hinweis: "Paket nicht gespeichert: " + (e instanceof Error ? e.message : String(e)) }; werte.paket_fehler = paket.hinweis; delete werte.paket; }
      }
    }
    await log(aktion, oppId);

    // Re-read from Close and mirror what Close actually holds.
    const fresh = await call(`/opportunity/${oppId}/`);
    const ctx = await mapContext(call, admin, [stand.close_lead_id]);
    const { error: upErr } = await admin.from("close_abschluesse").upsert(mapOpp(fresh, ctx), { onConflict: "close_opportunity_id" });
    if (upErr) throw new Error("In Close gespeichert, aber Neu-Einlesen ins CRM fehlgeschlagen: " + upErr.message);
    const lz = await syncLaufzeiten(admin);
    let notion: any = null; try { notion = await pushNotion(admin, lz.rows.filter((r: any) => r.client_id === stand.client_id)); } catch (e) { notion = { status: String(e) }; }
    const { data: row } = await admin.from("kunden_laufzeit_stand").select("*").eq("client_id", stand.client_id).maybeSingle();
    return json({ ok: true, aktion, paket, close_opportunity_id: oppId, pipeline: SALES_PIPELINE_ID, stand: row, notion });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("close-abschluss-schreiben", stand.kunde, msg);
    if (!b.pruefen) await log("fehlgeschlagen", oppId, msg);
    return json({ error: msg }, 502);
  }
});

// Latest "LS Cash Collect" activity per lead. Close only filters by activity type per single lead.
async function cashActivities(call: any, leadIds: string[]) {
  const out = new Map<string, any>();
  const one = async (lid: string) => {
    for (let skip = 0; ; skip += 100) {
      const p = await call(`/activity/custom/?lead_id=${encodeURIComponent(lid)}&custom_activity_type_id=${CASH_TYPE}&_limit=100&_skip=${skip}`);
      for (const a of p.data || []) { const prev = out.get(lid); if (!prev || String(a.date_created) > String(prev.date_created)) out.set(lid, a); }
      if (!p.has_more) break;
    }
  };
  for (let i = 0; i < leadIds.length; i += 5) await Promise.all(leadIds.slice(i, i + 5).map(one));
  return out;
}

// ---- Quick actions: extend / end a customer's contract. Writes only to Close, notes each step, re-reads afterwards.
const ABGANG: Record<string, string> = {
  stat_PRdhsPNJcgb2ZZ13rFEkaMldqH2gvwQHWnDXnZ32qo1: "Abgang: Laufzeit regulär beendet",
  stat_lw0C84V0kcTzRAyOFc9SNgpCq4l1mJLyea5fFEcW4Hg: "Abgang: Laufzeit abgebrochen",
  stat_4fldj1q89q9hJnOCwQd7wKyPLkUS9JtVkLw5t8je9Yx: "Abgang: Vorzeitig entlassen (durch uns)",
  stat_9Oxmm9S77UPZgEnwepIlXZr30CP4ncY3OTdzyOEmfZT: "Abgang: Insolvenz / Geschäftsaufgabe",
  stat_L1fkxQFOSGFrXGY9DVdB784etCE38HyLZqMVf94ZF8m: "Abgang: Sonderfall (außerhalb Verantwortung)",
};
const EHEMALIG = "stat_4NdZZtf9GLcjvzP8AjAuit0lmnJgOeyjs8P2JOVTfkF";
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Life = z.discriminatedUnion("aktion", [
  z.object({ aktion: z.literal("opps"), client_id: z.string().uuid() }),
  z.object({ aktion: z.literal("verlaengern"), client_id: z.string().uuid(), close_opportunity_id: z.string().min(1).max(100), startdatum: D, monate: z.number().int().min(1).max(120), notiz: z.string().max(2000).optional().nullable(), ueberschreiben_bestaetigt: z.boolean().optional() }),
  z.object({ aktion: z.literal("beenden"), client_id: z.string().uuid(), close_opportunity_id: z.string().min(1).max(100), status_id: z.enum(Object.keys(ABGANG) as [string, ...string[]]), kuendigungsdatum: D, letzter_vertragstag: D, begruendung: z.string().trim().min(1).max(4000) }),
]);
const de = (d: string | null | undefined) => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "–";
const mon = (m: any) => `${Number(m)} ${Number(m) === 1 ? "Monat" : "Monate"}`;
const span = (s: string | null, m: any) => s && m ? `${de(s)} – ${de(addMonths(s.slice(0, 10), Number(m)))} (${mon(m)})` : "unbekannt";
const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

async function lifecycle(admin: any, user: any, raw: any) {
  const p = Life.safeParse(raw);
  if (!p.success) return json({ error: "Ungültige Eingabe", details: p.error.flatten().fieldErrors }, 400);
  const b = p.data;
  const { data: stand } = await admin.from("kunden_laufzeit_stand").select("client_id, kunde, close_lead_id").eq("client_id", b.client_id).maybeSingle();
  if (!stand?.close_lead_id) return json({ error: "Kunde ist kein aktiver Close-Klient (oder ohne Close-Lead)." }, 404);
  let call: any;
  try { call = (await closeForPipeline()).call; } catch (e) { return json({ error: errMsg(e) }, 502); }
  const sd = `custom.${CF.startdatum}`, lz = `custom.${CF.laufzeit_monate}`, usd = `custom.${CF.upsell_startdatum}`, ulz = `custom.${CF.upsell_laufzeit}`;

  if (b.aktion === "opps") {
    try {
      const live = await call(`/opportunity/?lead_id=${encodeURIComponent(stand.close_lead_id)}&_limit=100`);
      const open = (live.data || []).filter((o: any) => o.status_type !== "lost" && !ABGANG[o.status_id]);
      return json({ opps: open.map((o: any) => ({ id: o.id, name: o.note || o.status_label || o.id, status: o.status_label, startdatum: o[sd] ?? null, laufzeit: o[lz] ?? null, wert: o.value != null ? o.value / 100 : null })) });
    } catch (e) { return json({ error: errMsg(e) }, 502); }
  }

  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const heute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const log = (aktion: string, werte: any, fehler: string | null = null) => admin.from("close_abschluss_schreiblog").insert({
    user_id: user.id, user_email: user.email, client_id: stand.client_id, kunde: stand.kunde, close_lead_id: stand.close_lead_id,
    close_opportunity_id: b.close_opportunity_id, aktion, werte, fehler,
  });
  let opp: any;
  try {
    opp = await call(`/opportunity/${encodeURIComponent(b.close_opportunity_id)}/`);
    if (opp.lead_id !== stand.close_lead_id) throw new Error("Die Opportunity gehört nicht zu diesem Kunden.");
  } catch (e) { return json({ error: errMsg(e), schritt: 0 }, 502); }
  const ersteLz = span(opp[sd], opp[lz]);
  const bisher = opp[usd] && opp[ulz] ? { s: String(opp[usd]).slice(0, 10), m: opp[ulz] } : null;
  const nachher = async () => {
    try {
      const fresh = await call(`/opportunity/${opp.id}/`);
      const ctx = await mapContext(call, admin, [stand.close_lead_id]);
      await admin.from("close_abschluesse").upsert(mapOpp(fresh, ctx), { onConflict: "close_opportunity_id" });
      const lzr = await syncLaufzeiten(admin);
      try { await pushNotion(admin, lzr.rows.filter((r: any) => r.client_id === stand.client_id)); } catch { /* notion optional */ }
      return null;
    } catch (e) { return "In Close gespeichert, aber Neu-Einlesen fehlgeschlagen: " + errMsg(e); }
  };

  if (b.aktion === "verlaengern") {
    if (bisher && !b.ueberschreiben_bestaetigt) return json({ error: `Für diesen Kunden ist bereits eine Verlängerung hinterlegt (${de(bisher.s)}, ${bisher.m} Mon.). Bestätigung fehlt.`, bisher, schritt: 0 }, 409);
    const werte = { verlaengerung_start: b.startdatum, verlaengerung_monate: b.monate, ueberschrieben: bisher };
    try { await call(`/opportunity/${opp.id}/`, "PUT", { [usd]: b.startdatum, [ulz]: b.monate }); }
    catch (e) { await log("fehlgeschlagen", werte, errMsg(e)); return json({ error: errMsg(e), schritt: 1 }, 502); }
    const vorher = bisher ? span(bisher.s, bisher.m) : ersteLz;
    const note = ["Verlängerung erfasst (CRM)", "", `Bisher:  ${vorher}`, `Neu:     ${span(b.startdatum, b.monate)}`,
      ...(bisher ? ["", `Überschrieben: bisherige Verlängerung ${span(bisher.s, bisher.m)} (Startdatum (Upsell) ${de(bisher.s)}, Laufzeit (Upsell) ${mon(bisher.m)}). 1. Laufzeit: ${ersteLz}`] : []),
      "", `Erfasst am ${de(heute)} durch ${name}`, ...(b.notiz?.trim() ? [b.notiz.trim()] : [])].join("\n");
    let teil: string | null = null;
    try { await call(`/activity/note/`, "POST", { lead_id: stand.close_lead_id, note }); }
    catch (e) { teil = `Verlängerung wurde gespeichert, aber die Notiz konnte nicht angelegt werden: ${errMsg(e)}. Bitte in Close prüfen.`; }
    await log(teil ? "verlängert (teilweise)" : "verlängert", werte, teil);
    const re = await nachher();
    return json({ ok: true, teilfehler: teil, einlesen_fehler: re });
  }

  // beenden: strict order, abort on step 1, report partial success on 2/3, never retry.
  const grund = ABGANG[b.status_id];
  const werte = { grund, kuendigungsdatum: b.kuendigungsdatum, letzter_vertragstag: b.letzter_vertragstag, begruendung: b.begruendung };
  try {
    await call(`/opportunity/${opp.id}/`, "PUT", { status_id: b.status_id, [`custom.${CF.kuendigungsdatum}`]: b.kuendigungsdatum, [`custom.${CF.letzter_vertragstag}`]: b.letzter_vertragstag, [`custom.${CF.abgangs_begruendung}`]: b.begruendung });
  } catch (e) { await log("fehlgeschlagen", werte, errMsg(e)); return json({ error: errMsg(e), schritt: 1 }, 502); }
  let teil: string | null = null;
  try {
    await call(`/lead/${stand.close_lead_id}/`, "PUT", { status_id: EHEMALIG });
    // Mirror the state Close just accepted so the customer leaves the active list now, not at the next hourly sync.
    await admin.from("bonus_kunden_aktuell").update({ aktiv: false, close_status_label: "Ehemaliger Klient" }).eq("close_lead_id", stand.close_lead_id);
  } catch (e) { teil = `Opportunity wurde ausgebucht, aber der Lead-Status konnte nicht gesetzt werden: ${errMsg(e)}. Bitte in Close prüfen.`; }
  const gesamt = bisher ? `${opp[sd] ? de(String(opp[sd]).slice(0, 10)) : "unbekannt"} – ${de(addMonths(bisher.s, Number(bisher.m)))} (inkl. Verlängerung ${mon(bisher.m)})` : ersteLz;
  const note = ["Kunde ausgebucht (CRM)", "", `Grund:               ${grund}`, `Kündigungsdatum:     ${de(b.kuendigungsdatum)}`, `Letzter Vertragstag: ${de(b.letzter_vertragstag)}`,
    `Laufzeit gesamt:     ${gesamt}`, "", `Begründung: ${b.begruendung}`, "", `Erfasst am ${de(heute)} durch ${name}`].join("\n");
  try { await call(`/activity/note/`, "POST", { lead_id: stand.close_lead_id, note }); }
  catch (e) { const t = `die Notiz konnte nicht angelegt werden: ${errMsg(e)}`; teil = teil ? `${teil} Außerdem ${t}.` : `Opportunity wurde ausgebucht, aber ${t}. Bitte in Close prüfen.`; }
  await log(teil ? "ausgebucht (teilweise)" : "ausgebucht", werte, teil);
  const re = await nachher();
  return json({ ok: true, teilfehler: teil, einlesen_fehler: re });
}
