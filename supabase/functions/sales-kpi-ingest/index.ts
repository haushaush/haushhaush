// Receives the rows n8n writes into the "s-kpi" Google Sheet (tabs Tagesdaten · Bestand · Abgaenge) and upserts them,
// so the Sales overview shows exactly the numbers of the daily Slack report. Idempotent per natural key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (k: string) => k.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIAS: Record<string, string[]> = {
  datum: ["datum", "date", "tag"], kanal: ["kanal", "channel", "quelle"], user_name: ["user", "user_name", "mitarbeiter", "name"],
  dials: ["dials", "anwahlen", "calls"], eg_gebucht: ["eg_gebucht", "erstgespraech_gebucht", "erstgespraeche_gebucht"],
  eg_gefuehrt: ["eg_gefuehrt", "erstgespraech_gefuehrt", "erstgespraeche_gefuehrt"], zg_gebucht: ["zg_gebucht", "zweitgespraech_gebucht", "zweitgespraeche_gebucht"],
  zg_gefuehrt: ["zg_gefuehrt", "zweitgespraech_gefuehrt", "zweitgespraeche_gefuehrt"], abschluesse: ["abschluesse", "won", "deals_won", "abschluss"],
  umsatz: ["umsatz", "umsatz_geschrieben", "revenue"], bestand: ["bestand", "kunden", "aktive_kunden"], kunde: ["kunde", "lead", "lead_name", "firma"],
  grund: ["grund", "abgangsgrund", "reason"], schluessel: ["schluessel", "id", "lead_id", "opportunity_id"],
};
function pick(row: Record<string, unknown>) {
  const n: Record<string, unknown> = {}; for (const [k, v] of Object.entries(row)) n[norm(k)] = v;
  const get = (f: string) => { for (const a of ALIAS[f]) if (n[a] !== undefined && n[a] !== "") return n[a]; return null; };
  return { get, raw: row };
}
const num = (v: unknown) => { if (v == null || v === "") return null; const x = Number(String(v).replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : null; };
function date(v: unknown) {
  if (v == null) return null; const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
const Rows = z.array(z.record(z.unknown())).max(20000);
const Body = z.object({ tagesdaten: Rows.optional(), bestand: Rows.optional(), abgaenge: Rows.optional() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  const expected = Deno.env.get("SALES_KPI_INGEST_TOKEN");
  if (!expected) return json({ error: "SALES_KPI_INGEST_TOKEN ist nicht hinterlegt" }, 500);
  if (req.headers.get("x-ingest-token") !== expected) return json({ error: "unauthorized" }, 401);
  const admin0 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Fallback path only: the Google Sheet (sales-sheet-sync) is the source unless app_settings.sales_kpi_quelle = "ingest".
  const { data: q } = await admin0.from("app_settings").select("value").eq("key", "sales_kpi_quelle").maybeSingle();
  if (JSON.stringify(q?.value ?? "") !== '"ingest"') return json({ error: "Rückfallweg inaktiv: Quelle ist das Google Sheet (sales-sheet-sync)." }, 409);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ungültiges Format", details: parsed.error.flatten() }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();
  const out: Record<string, unknown> = {}; const abgelehnt: string[] = [];

  const up = async (table: string, rows: any[], key: string) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict: key });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    return rows.length;
  };
  try {
    if (parsed.data.tagesdaten) {
      const m = new Map<string, any>();
      parsed.data.tagesdaten.forEach((r, i) => {
        const { get, raw } = pick(r); const d = date(get("datum"));
        if (!d) { abgelehnt.push(`tagesdaten[${i}]: Datum fehlt/unlesbar`); return; }
        const row = { datum: d, kanal: String(get("kanal") ?? ""), user_name: String(get("user_name") ?? ""), dials: num(get("dials")), eg_gebucht: num(get("eg_gebucht")), eg_gefuehrt: num(get("eg_gefuehrt")), zg_gebucht: num(get("zg_gebucht")), zg_gefuehrt: num(get("zg_gefuehrt")), abschluesse: num(get("abschluesse")), umsatz: num(get("umsatz")), werte: raw, empfangen_am: now };
        m.set(`${row.datum}|${row.kanal}|${row.user_name}`, row); // last row wins within a batch
      });
      out.tagesdaten = await up("sales_tagesdaten", [...m.values()], "datum,kanal,user_name");
    }
    if (parsed.data.bestand) {
      const m = new Map<string, any>();
      parsed.data.bestand.forEach((r, i) => {
        const { get, raw } = pick(r); const d = date(get("datum"));
        if (!d) { abgelehnt.push(`bestand[${i}]: Datum fehlt/unlesbar`); return; }
        m.set(d, { datum: d, bestand: num(get("bestand")), werte: raw, empfangen_am: now });
      });
      out.bestand = await up("sales_bestand", [...m.values()], "datum");
    }
    if (parsed.data.abgaenge) {
      const m = new Map<string, any>();
      for (const [i, r] of parsed.data.abgaenge.entries()) {
        const { get, raw } = pick(r); const d = date(get("datum")); const kunde = get("kunde");
        if (!d && !get("schluessel")) { abgelehnt.push(`abgaenge[${i}]: Datum und Schlüssel fehlen`); continue; }
        const schluessel = String(get("schluessel") ?? `${d}|${String(kunde ?? "").trim().toLowerCase()}`);
        m.set(schluessel, { schluessel, datum: d, kunde: kunde == null ? null : String(kunde), grund: get("grund") == null ? null : String(get("grund")), kanal: get("kanal") == null ? null : String(get("kanal")), werte: raw, empfangen_am: now });
      }
      out.abgaenge = await up("sales_abgaenge", [...m.values()], "schluessel");
    }
    await admin.from("sales_sync_log").insert({ sync_type: "sheet_ingest", status: abgelehnt.length ? "teilweise" : "ok", details: { ...out, abgelehnt } }).then(() => {}, () => {});
    return json({ ok: true, uebernommen: out, abgelehnt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sales-kpi-ingest", msg);
    return json({ ok: false, error: msg, abgelehnt }, 500);
  }
});
