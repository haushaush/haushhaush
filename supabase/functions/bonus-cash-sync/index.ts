// Cash Collect (criteria 2/3) from paid Qonto invoices: full NET amount (subtotal, else total − VAT); no ad-budget deduction.
// Invoices without a confirmed customer link, or of customers outside the month snapshot, go to the clarification list.
// Dedupe key is source-independent (invoice number) so a later lexoffice source cannot double-count the same payment.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkCron, cors, currentMonthBerlin, json, requireManager } from "../_shared/bonusClose.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;
const nextMonth = (m: string) => { const d = new Date(m + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : null; };
// Comparison only (Qonto writes two spaces between first/last name); stored names stay original.
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

async function syncMonth(admin: any, monat: string, mitarbeiter_id: string, snapshotMonat: string) {
  const [{ data: inv, error: iErr }, { data: links }, { data: ign }, { data: snap }] = await Promise.all([
    admin.from("qonto_client_invoices").select("qonto_invoice_id, number, client_name, client_id, total_amount, subtotal_amount, vat_amount, paid_at, raw").eq("status", "paid").gte("paid_at", monat).lt("paid_at", nextMonth(monat)),
    admin.from("qonto_client_links").select("qonto_client_name, qonto_client_id, client_id").eq("is_confirmed", true).not("client_id", "is", null),
    admin.from("bonus_cash_ignorierte_empfaenger").select("qonto_client_name"),
    admin.from("bonus_kunden_snapshot").select("client_id").eq("monat", snapshotMonat).eq("mitarbeiter_id", mitarbeiter_id),
  ]);
  if (iErr) throw new Error("Rechnungen: " + iErr.message);
  if (!snap?.length) throw new Error(`Kein Kundensnapshot für ${snapshotMonat}`);
  const byName = new Map((links || []).map((l: any) => [norm(l.qonto_client_name), l.client_id]));
  const byQid = new Map((links || []).filter((l: any) => l.qonto_client_id).map((l: any) => [l.qonto_client_id, l.client_id]));
  const ignored = new Set((ign || []).map((x: any) => norm(x.qonto_client_name)));
  const inSnap = new Set(snap.map((s: any) => s.client_id));

  const rows: any[] = [];
  let ignoriert = 0;
  for (const i of inv || []) {
    const name = (i.client_name || "").trim();
    if (ignored.has(norm(name))) { ignoriert++; continue; }
    const brutto = num(i.raw?.total_amount?.value) ?? num(i.total_amount) ?? 0;
    const vat = num(i.raw?.vat_amount?.value) ?? num(i.vat_amount) ?? 0;
    const netto = r2(num(i.subtotal_amount) ?? brutto - vat);
    const clientId = byQid.get(i.client_id) || byName.get(norm(name)) || null;
    const ok = !!clientId && inSnap.has(clientId);
    rows.push({
      monat, client_id: clientId, mitarbeiter_id: ok ? mitarbeiter_id : null, betrag: netto,
      eingang_am: i.paid_at, quelle: "qonto", quelle_id: i.qonto_invoice_id,
      zahlung_schluessel: i.number ? `rechnung:${squash(i.number)}` : `qonto:${i.qonto_invoice_id}`,
      rechnungsnummer: i.number, empfaenger_name: name || null, brutto: r2(brutto), netto_voll: netto, werbebudget_abzug: 0, abzug_positionen: [],
      zugeordnet: ok, klaer_grund: ok ? null : !clientId ? "Rechnungsempfänger keinem Kunden zugeordnet" : "Kunde nicht im Kundensnapshot dieses Monats",
      updated_at: new Date().toISOString(),
    });
  }
  const uniq = [...new Map(rows.map((r) => [r.zahlung_schluessel, r])).values()];
  // Never overwrite a payment already recorded from another source (e.g. lexoffice).
  const { data: other } = await admin.from("bonus_cash_collect").select("zahlung_schluessel").neq("quelle", "qonto").in("zahlung_schluessel", uniq.length ? uniq.map((r) => r.zahlung_schluessel) : ["-"]);
  const taken = new Set((other || []).map((o: any) => o.zahlung_schluessel));
  const write = uniq.filter((r) => !taken.has(r.zahlung_schluessel));
  if (write.length) {
    const { error } = await admin.from("bonus_cash_collect").upsert(write, { onConflict: "zahlung_schluessel" });
    if (error) throw new Error("Schreiben fehlgeschlagen: " + error.message);
  }
  const { data: ex } = await admin.from("bonus_cash_collect").select("id, zahlung_schluessel").eq("monat", monat).eq("quelle", "qonto");
  const keep = new Set(write.map((r) => r.zahlung_schluessel));
  const stale = (ex || []).filter((e: any) => !keep.has(e.zahlung_schluessel)).map((e: any) => e.id);
  if (stale.length) await admin.from("bonus_cash_collect").delete().in("id", stale);

  const zu = write.filter((r) => r.zugeordnet), kl = write.filter((r) => !r.zugeordnet);
  return {
    monat, rechnungen: write.length, zugeordnet: zu.length, netto_summe: r2(zu.reduce((s, r) => s + r.betrag, 0)),
    netto_voll_summe: r2(zu.reduce((s, r) => s + r.netto_voll, 0)), werbebudget_abgezogen: 0,
    klaerliste_anzahl: kl.length, klaerliste_eur: r2(kl.reduce((s, r) => s + r.betrag, 0)), ignoriert, doppelt_andere_quelle: taken.size,
    klaerliste: kl.map((r) => ({ empfaenger: r.empfaenger_name, betrag: r.betrag, grund: r.klaer_grund })),
  };
}

async function runLogged(admin: any, monat: string, mitarbeiter_id: string, ausloeser: string) {
  const { data: log } = await admin.from("bonus_sync_log").insert({ sync_typ: "cash", ausloeser, monat, mitarbeiter_id }).select("id").single();
  try {
    // Reference month before the model start has no own snapshot: use the first evaluated month's snapshot (same customers).
    const { data: ma } = await admin.from("bonus_mitarbeiter").select("modell_start").eq("id", mitarbeiter_id).single();
    const snapMonat = ma && monat < ma.modell_start ? ma.modell_start : monat;
    const r = await syncMonth(admin, monat, mitarbeiter_id, snapMonat);
    if (snapMonat !== monat) {
      // store the reference value so criterion 3 compares against a saved basis
      const { data: bm } = await admin.from("bonus_monate").select("status").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id).maybeSingle();
      if (bm?.status !== "freigegeben") {
        const { error } = await admin.from("bonus_monate").upsert({
          monat, mitarbeiter_id, p1_zufriedenheit: 0, p2_cash_niveau: 0, p3_cash_entwicklung: 0, p4_churn: 0, p5_calls: 0, punkte_gesamt: 0, bonus_eur: 0, upsell_beteiligung_eur: 0, status: "offen",
          berechnungsdetails: { nur_referenzwert: true, hinweis: "Referenzmonat vor Modellstart — keine Bonusberechnung, nur Cash-Referenz", snapshot_monat: snapMonat, cash: { summe_eur: r.netto_summe, netto_voll_eur: r.netto_voll_summe, werbebudget_abgezogen_eur: r.werbebudget_abgezogen, rechnungen: r.zugeordnet }, berechnet_am: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }, { onConflict: "monat,mitarbeiter_id" });
        if (error) throw new Error("Referenzwert speichern: " + error.message);
      }
    }
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: true, gefunden: r.rechnungen, neu: r.zugeordnet, nicht_zuordenbar: r.klaerliste }).eq("id", log.id);
    return { ok: true, ...r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bonus-cash-sync failed", { monat, msg });
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: false, fehler: msg }).eq("id", log.id);
    return { ok: false, monat, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "bonus_cash_sync");
  if (cron === false) return json({ error: "unauthorized" }, 401);
  if (cron) {
    let cb: any = {}; try { cb = await req.clone().json(); } catch { /* none */ }
    const cronMonat = /^\d{4}-\d{2}-01$/.test(String(cb?.monat || "")) ? cb.monat : currentMonthBerlin();
    const { data: mas } = await admin.from("bonus_mitarbeiter").select("id").eq("aktiv", true);
    const out = [];
    for (const m of mas || []) out.push(await runLogged(admin, cronMonat, m.id, "cron"));
    return json({ ok: out.every((r) => r.ok), results: out });
  }
  const g = await requireManager(req, admin, createClient);
  if (!g.ok) return g.res!;
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const monat = String(body?.monat || ""), mitarbeiter_id = String(body?.mitarbeiter_id || "");
  if (!/^\d{4}-\d{2}-01$/.test(monat)) return json({ error: "monat muss YYYY-MM-01 sein" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(mitarbeiter_id)) return json({ error: "mitarbeiter_id ungültig" }, 400);
  const r = await runLogged(admin, monat, mitarbeiter_id, "manuell");
  return json(r, r.ok ? 200 : 502);
});
