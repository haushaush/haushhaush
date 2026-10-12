// Reads the n8n-filled "s-kpi" Google Sheet (Tagesdaten · Abgaenge · Bestand) and upserts it into
// sales_tagesdaten / sales_bestand / sales_abgaenge. First successful run imports everything, later runs the last 14 days.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SHEET = "16ivKJYRM8i83nfgLftJHuMIelurtNUuxdiNjqAGIGoU";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
export const KANAELE = ["Ads", "Cold Call", "Website / Organisch", "AttentionX Tool", "Direktbuchung"];
const NICHT_OFFEN = new Set(["Won", "Upsell", "Upsell ausstehend", "Unqualifiziert", "Lost", "Ehemaliger Kunde"]);

const num = (v: unknown) => {
  if (v == null) return null; let s = String(v).trim(); if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // 1.234,5 → 1234.5
  const x = Number(s.replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : null;
};
function date(v: unknown) {
  if (v == null) return null; const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}
const objects = (vals: string[][] | undefined) => {
  const [head, ...rows] = vals ?? []; if (!head) return [];
  return rows.filter(r => r.some(c => String(c ?? "").trim() !== "")).map(r => { const o: Record<string, string> = {}; head.forEach((h, i) => { o[h] = r[i] ?? ""; }); o.__erste = r[0] ?? ""; return o; });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Auth: cron token or signed-in user with sales access
  let ausloeser = "cron";
  const tok = req.headers.get("x-cron-token");
  if (tok) {
    const { data } = await admin.from("bonus_cron_tokens").select("token").eq("name", "sales_sheet_sync").maybeSingle();
    if (!data || data.token !== tok) return json({ error: "unauthorized" }, 401);
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Nicht angemeldet" }, 401);
    const [a, b, c] = await Promise.all([
      admin.rpc("user_has_permission", { target_user_id: u.user.id, requested_permission_key: "sales.view" }),
      admin.rpc("user_has_permission", { target_user_id: u.user.id, requested_permission_key: "sales.uebersicht.view" }),
      userClient.rpc("is_admin"),
    ]);
    if (!a.data && !b.data && !c.data) return json({ error: "Keine Berechtigung für die Sales-Übersicht" }, 403);
    ausloeser = u.user.email ?? u.user.id;
  }

  const body = await req.json().catch(() => ({}));
  const { count: okLaeufe } = await admin.from("sales_sheet_sync_laeufe").select("id", { count: "exact", head: true }).eq("status", "ok");
  const voll = !okLaeufe || body?.voll === true;
  const ab = new Date(); ab.setUTCDate(ab.getUTCDate() - 14); const abIso = ab.toISOString().slice(0, 10);
  const { data: lauf } = await admin.from("sales_sheet_sync_laeufe").insert({ modus: voll ? "voll" : "14_tage", ausloeser }).select("id").single();
  const fin = (patch: Record<string, unknown>) => admin.from("sales_sheet_sync_laeufe").update({ ...patch, beendet_am: new Date().toISOString() }).eq("id", lauf!.id);

  try {
    const LK = Deno.env.get("LOVABLE_API_KEY"), GK = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LK || !GK) throw new Error("Google-Sheets-Verbindung ist nicht verknüpft");
    const res = await fetch(`${GATEWAY}/spreadsheets/${SHEET}/values:batchGet?ranges=Tagesdaten&ranges=Abgaenge&ranges=Bestand&valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${LK}`, "X-Connection-Api-Key": GK } });
    if (!res.ok) throw new Error(`Google Sheets [${res.status}]: ${await res.text()}`);
    const vr = (await res.json()).valueRanges as { values?: string[][] }[];
    const [tg, ag, bs] = vr.map(v => objects(v.values));
    const now = new Date().toISOString();
    const verworfen = { tagesdaten: 0, abgaenge: 0, bestand: 0 };
    const unbekannt = new Set<string>(); let leereKanaele = 0;
    const kanalCheck = (k: string) => { const t = k.trim(); if (!t) { leereKanaele++; return; } if (!KANAELE.includes(t)) unbekannt.add(t); };
    const inScope = (d: string | null) => voll || (d != null && d >= abIso);
    let minDatum: string | null = null; const seen = (d: string) => { if (!minDatum || d < minDatum) minDatum = d; };

    const t = new Map<string, any>();
    for (const r of tg) {
      const d = date(r["Datum"]); if (!d) { verworfen.tagesdaten++; continue; }
      seen(d); kanalCheck(r["Kanal"] ?? "");
      if (!inScope(d)) continue;
      const { __erste, ...raw } = r;
      const row = { datum: d, kanal: (r["Kanal"] ?? "").trim(), user_name: (r["User"] ?? "").trim(), dials: num(r["Dials"]), eg_gebucht: num(r["EG_gebucht"]), eg_gefuehrt: num(r["EG_gefuehrt"]), zg_gebucht: num(r["ZG_gebucht"]), zg_gefuehrt: num(r["ZG_gefuehrt"]), abschluesse: num(r["Won"]), umsatz: num(r["Umsatz"]), werte: raw, empfangen_am: now };
      t.set(`${row.datum}|${row.kanal}|${row.user_name}`, row);
    }
    const b = new Map<string, any>();
    for (const r of bs) {
      const d = date(r["Datum"]); if (!d) { verworfen.bestand++; continue; }
      seen(d); kanalCheck(r["Kanal"] ?? "");
      if (!inScope(d)) continue;
      const { __erste, ...raw } = r; let offen = 0;
      for (const [k, v] of Object.entries(raw)) if (k !== "Datum" && k !== "Kanal" && !NICHT_OFFEN.has(k)) offen += num(v) ?? 0;
      b.set(`${d}|${(r["Kanal"] ?? "").trim()}`, { datum: d, kanal: (r["Kanal"] ?? "").trim(), bestand: offen, werte: raw, empfangen_am: now });
    }
    const a = new Map<string, any>();
    for (const r of ag) {
      // The sheet's date column sits in column A (header "q"); a later "Datum" column is used when filled.
      const d = date(r["Datum"]) ?? date(r["q"]) ?? date(r.__erste);
      if (!d) { verworfen.abgaenge++; continue; }
      seen(d); if (r["Kanal"]) kanalCheck(r["Kanal"]);
      if (!inScope(d)) continue;
      const { __erste, ...raw } = r;
      const kunde = (r["Kunde"] || r["lead_id"] || "").trim() || null;
      const schluessel = (r["Opportunity_ID"] || r["Schluessel"] || "").trim() || `${d}|${(kunde ?? "").toLowerCase()}`;
      a.set(schluessel, { schluessel, datum: d, kunde, grund: (r["Grund"] ?? "").trim() || null, kanal: (r["Kanal"] ?? "").trim() || null, werte: raw, empfangen_am: now });
    }
    const up = async (table: string, rows: any[], key: string) => {
      for (let i = 0; i < rows.length; i += 500) { const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict: key }); if (error) throw new Error(`${table}: ${error.message}`); }
      return rows.length;
    };
    const zeilen = {
      tagesdaten: await up("sales_tagesdaten", [...t.values()], "datum,kanal,user_name"),
      abgaenge: await up("sales_abgaenge", [...a.values()], "schluessel"),
      bestand: await up("sales_bestand", [...b.values()], "datum,kanal"),
      im_sheet: { tagesdaten: tg.length, abgaenge: ag.length, bestand: bs.length },
      abgaenge_ohne_kanal: leereKanaele,
    };
    await fin({ status: "ok", zeilen, verworfen, unbekannte_kanaele: [...unbekannt], daten_ab: minDatum });
    return json({ ok: true, modus: voll ? "voll" : "14_tage", zeilen, verworfen, unbekannte_kanaele: [...unbekannt], daten_ab: minDatum });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sales-sheet-sync", msg);
    await fin({ status: "fehler", fehler: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
