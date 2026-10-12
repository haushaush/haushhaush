// Shared mapping + runtime derivation for Close "Sales" opportunities (Close → CRM → Notion, one way).
export const CF = {
  abschlusswert: "cf_CzZln3OI4ga4fsH5ExJOYyhXB7Ala5KSzJYx3vN8QaM",
  setup_fee: "cf_YDo2SJ1IesmkCxcQt9SC9EmCgyqtlSgsjV17yAKeXq3",
  retainer_monat: "cf_UYJbz07xxkiOIzFy0V8KaJfzvjTuv3D9lSRS2fbyhna",
  laufzeit_monate: "cf_gNZi2EPQAsZgvHmeGzoK8x637zfO2oniqIFuo0LxFML",
  startdatum: "cf_QJEzJcq6pb0frbqR6jXkYV6vce6ketIPxjU1GsEcqSp",
  leistungen: "cf_T8SRZuQuWMU2ge3MMdqCRxqjeRlH45A55ovevuhC49z",
  deal_typ: "cf_gPGw2JhWNy7LCFHE1bFXKiPVC14F5cVrRkA9ibYzlp8",
  close_typ: "cf_ly917S7WIyQ0edMXPFXkLNvmwpIHb2fkEQJUSW004QP",
  closer: "cf_Qy8Ksgdsj9hRmcaZoWSl7XUeHJ2MlHeNPk4z9vmuRvk",
  setter: "cf_k9AW35NCNhDiMeEuPyySpjsPnF3TEcxpOHwtEbxCe6F",
  cold_caller: "cf_jTZBkU1D3P3qcILtycHA8HFBOBRm3Fc0oRGelUNwwlS",
  umsetzungszeitraum: "cf_0RQqr4QdUtaJKIwDAPbtpLz9F7fg27PLmx45rsLATQm",
  kuendigungsdatum: "cf_981vqJkEzowJTeNoRnibMiqCdH5ffbMZtnddLU9tN2f",
  letzter_vertragstag: "cf_ZEvtumauW5XdcFJpGq52660WUxRFebOSnmWiOFbH2d2",
  abgangs_begruendung: "cf_4HaX7c7hvnnwDDXrBSm3ej6bGf70EiqhWPg4LgyHGDK",
  abgangsgrund: "cf_iuKZiMvCf8jfGN12dthhrfXY3U6V2ewMlODFAP4TPXm",
} as const;
const NUM = new Set(["abschlusswert", "setup_fee", "retainer_monat", "laufzeit_monate"]);
const DATE = new Set(["startdatum", "kuendigungsdatum", "letzter_vertragstag"]);
export const NOTION_KUNDEN_DB = "2229f181-82a0-8099-a477-d6ff96c0f59e";

export const txt = (v: any) => v == null || v === "" ? null : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? (v.display_name || v.name || JSON.stringify(v)) : String(v);
export const num = (v: any) => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
export const day = (v: any) => v ? String(v).slice(0, 10) : null;
// Closing company = origin of the lead: transferred from Viral Connect → Viral Connect, everything else (own Close) → LeadSharks.
export const marke = (v: any) => (txt(v) || "").trim().toLowerCase() === "viral connect" ? "Viral Connect" : "LeadSharks";
export function addMonths(iso: string, m: number) {
  const d = new Date(iso + "T00:00:00Z"); const whole = Math.floor(m);
  d.setUTCMonth(d.getUTCMonth() + whole);
  if (m - whole) d.setUTCDate(d.getUTCDate() + Math.round((m - whole) * 30));
  return d.toISOString().slice(0, 10);
}

export type MapCtx = { upsellFields: any[]; person: (v: any) => string | null; leads: Map<string, any>; clientByLead: Map<string, any>; now: string };
export function mapOpp(o: any, x: MapCtx) {
  const c = (k: keyof typeof CF) => o[`custom.${CF[k]}`];
  const custom: Record<string, any> = {};
  for (const k of Object.keys(o)) if (k.startsWith("custom.")) custom[k.slice(7)] = o[k];
  const lead = x.leads.get(o.lead_id) || {};
  const row: any = {
    close_opportunity_id: o.id, close_lead_id: o.lead_id, lead_name: o.lead_name, client_id: x.clientByLead.get(o.lead_id) ?? null,
    status_id: o.status_id, status_label: o.status_label, status_typ: o.status_type,
    wert: o.value != null ? o.value / 100 : null, wert_periode: o.value_period,
    status_geaendert_am: o.date_won || o.date_lost || o.date_updated, angelegt_von: o.created_by_name, angelegt_am: o.date_created,
    geaendert_am: o.date_updated, upsell: Object.fromEntries(x.upsellFields.map((f: any) => [f.name, o[`custom.${f.id}`] ?? null])),
    branche: lead.branche ?? null, sub_niche: lead.sub_niche ?? null, kanal: lead.kanal ?? null, marke: marke(lead.marke), custom, synced_at: x.now,
  };
  for (const k of Object.keys(CF) as (keyof typeof CF)[]) row[k] = NUM.has(k) ? num(c(k)) : DATE.has(k) ? day(c(k)) : ["closer", "setter", "cold_caller"].includes(k) ? x.person(c(k)) : txt(c(k));
  return row;
}

/** Field metadata + user names needed to map opportunities. */
export async function mapContext(call: any, admin: any, leadIds: string[]): Promise<MapCtx> {
  const fields = await call(`/custom_field/opportunity/?_limit=200`);
  const known = new Set(Object.values(CF));
  const upsellFields = (fields.data || []).filter((f: any) => !known.has(f.id) && /upsell|sparten|untermarke/i.test(f.name || ""));
  const users = new Map<string, string>();
  for (let skip = 0; ; skip += 100) { const u = await call(`/user/?_limit=100&_skip=${skip}`); (u.data || []).forEach((x: any) => users.set(x.id, `${x.first_name || ""} ${x.last_name || ""}`.trim() || x.email)); if (!u.has_more) break; }
  const person = (v: any) => { const t = txt(v); return t && users.has(t) ? users.get(t)! : t; };
  const leads = new Map<string, any>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data } = await admin.from("close_lead_spiegel").select("close_lead_id, marke, branche, sub_niche, kanal").in("close_lead_id", leadIds.slice(i, i + 200));
    (data || []).forEach((l: any) => leads.set(l.close_lead_id, l));
  }
  const { data: akt } = await admin.from("bonus_kunden_aktuell").select("close_lead_id, client_id").not("client_id", "is", null);
  return { upsellFields, person, leads, clientByLead: new Map((akt || []).map((r: any) => [r.close_lead_id, r.client_id])), now: new Date().toISOString() };
}

export async function syncLaufzeiten(admin: any) {
  const now = new Date().toISOString();
  const { data: akt, error } = await admin.from("bonus_kunden_aktuell").select("client_id, close_lead_id, lead_name, close_status_label, aktiv").not("client_id", "is", null);
  if (error) throw new Error(error.message);
  const active = (akt || []).filter((r: any) => r.aktiv);
  const leadIds = active.map((r: any) => r.close_lead_id);
  const { data: ab } = await admin.from("close_abschluesse").select("close_opportunity_id, close_lead_id, status_typ, startdatum, laufzeit_monate, status_geaendert_am").in("close_lead_id", leadIds.length ? leadIds : ["-"]);
  const byLead = new Map<string, any[]>();
  (ab || []).forEach((a: any) => byLead.set(a.close_lead_id, [...(byLead.get(a.close_lead_id) || []), a]));
  // Fallback source: won Viral Connect deals (read-only mirror close_opportunities), matched by CRM client.
  const clientIds = active.map((r: any) => r.client_id);
  const { data: vc } = await admin.from("close_vc_abschluesse").select("close_opportunity_id, client_id, status_typ, startdatum, laufzeit_monate, status_geaendert_am")
    .eq("status_typ", "won").in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
  const vcBy = new Map<string, any[]>();
  (vc || []).forEach((a: any) => vcBy.set(a.client_id, [...(vcBy.get(a.client_id) || []), a]));
  const sortNewest = (l: any[]) => l.sort((a: any, b: any) => String(b.startdatum || b.status_geaendert_am || "").localeCompare(String(a.startdatum || a.status_geaendert_am || "")));
  const rows: any[] = [];
  for (const r of active) {
    const list = sortNewest((byLead.get(r.close_lead_id) || []).filter((a: any) => a.status_typ === "won"));
    const vlist = sortNewest(vcBy.get(r.client_id) || []);
    // Our Close first; Viral Connect only when ours has no complete deal.
    const full = list.find((a: any) => a.startdatum && a.laufzeit_monate);
    const vfull = full ? null : vlist.find((a: any) => a.startdatum && a.laufzeit_monate);
    const pick = full || list[0];
    const use = full || vfull || pick || vlist[0];
    const fehlt: string[] = [];
    if (!use) fehlt.push("kein gewonnener Abschluss verknüpft (weder Haush Haush noch Viral Connect)");
    else if (!full && !vfull) { if (!use.startdatum) fehlt.push("kein Startdatum"); if (!use.laufzeit_monate) fehlt.push("keine Laufzeit"); }
    const ok = full || vfull;
    rows.push({
      client_id: r.client_id, close_lead_id: r.close_lead_id, kunde: r.lead_name, close_status_label: r.close_status_label,
      // close_opportunity_id only ever points at OUR Close; VC deals are referenced separately and never written.
      close_opportunity_id: pick?.close_opportunity_id ?? null,
      vc_opportunity_id: vfull ? vfull.close_opportunity_id : (!pick && vlist[0] ? vlist[0].close_opportunity_id : null),
      quelle: full || (pick && !vfull) ? "Haush Haush" : (vfull || vlist[0]) ? "Viral Connect" : null,
      startdatum: use?.startdatum ?? null, laufzeit_monate: use?.laufzeit_monate ?? null,
      vertragsende: ok ? addMonths(String(ok.startdatum).slice(0, 10), Number(ok.laufzeit_monate)) : null, fehlt, aktualisiert_am: now,
    });
  }
  if (rows.length) {
    const { error: uErr } = await admin.from("kunden_laufzeit_stand").upsert(rows, { onConflict: "client_id" });
    if (uErr) throw new Error("Laufzeiten schreiben fehlgeschlagen: " + uErr.message);
  }
  // Customers that are no longer betreut leave the runtime list entirely (no reminders for finished customers).
  const keep = new Set(rows.map((r) => r.client_id));
  const { data: old } = await admin.from("kunden_laufzeit_stand").select("client_id");
  const drop = (old || []).map((o: any) => o.client_id).filter((id: string) => !keep.has(id));
  if (drop.length) await admin.from("kunden_laufzeit_stand").delete().in("client_id", drop);
  // CRM mirrors Close: complete runtimes go into the customer record.
  for (const r of rows.filter((x) => x.vertragsende)) {
    const m = Number(r.laufzeit_monate);
    await admin.from("clients").update({ startdatum: r.startdatum, enddatum: r.vertragsende, laufzeit: `${m} ${m === 1 ? "Monat" : "Monate"}` }).eq("id", r.client_id);
  }
  return { aktive: rows.length, mit_laufzeit: rows.filter((r) => r.vertragsende).length, unklar: rows.filter((r) => !r.vertragsende).length, entfernt: drop.length, rows };
}

export async function pushNotion(admin: any, rows: any[]) {
  const key = Deno.env.get("NOTION_API_KEY");
  if (!key) return { status: "NOTION_API_KEY fehlt" };
  const h = { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${NOTION_KUNDEN_DB}`, { headers: h });
  const dbText = await dbRes.text();
  if (!dbRes.ok) return { status: `Notion-Datenbank nicht erreichbar (${dbRes.status})`, details: dbText.slice(0, 300) };
  const props = JSON.parse(dbText).properties || {};
  const need = ["Startdatum", "Enddatum", "Laufzeit"].filter((p) => !props[p]);
  if (need.length) return { status: `Notion-Felder fehlen: ${need.join(", ")}` };
  const ids = rows.filter((r) => r.vertragsende).map((r) => r.client_id);
  const { data: cl } = await admin.from("clients").select("id, notion_id").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).not("notion_id", "is", null);
  const notionBy = new Map((cl || []).map((c: any) => [c.id, c.notion_id]));
  const { data: prev } = await admin.from("kunden_laufzeit_stand").select("client_id, notion_stand").in("client_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const prevBy = new Map((prev || []).map((p: any) => [p.client_id, p.notion_stand]));
  let geschrieben = 0, unveraendert = 0, fehler = 0; const ohneNotion: string[] = [];
  for (const r of rows.filter((x) => x.vertragsende)) {
    const pid = notionBy.get(r.client_id);
    if (!pid) { ohneNotion.push(r.kunde); continue; }
    const m = Number(r.laufzeit_monate); const label = `${m} ${m === 1 ? "Monat" : "Monate"}`;
    const stand = `${r.startdatum}|${r.vertragsende}|${label}`;
    if (prevBy.get(r.client_id) === stand) { unveraendert++; continue; }
    const lz = props["Laufzeit"].type === "select" ? { select: { name: label } } : props["Laufzeit"].type === "number" ? { number: m } : { rich_text: [{ text: { content: label } }] };
    const res = await fetch(`https://api.notion.com/v1/pages/${pid}`, { method: "PATCH", headers: h, body: JSON.stringify({ properties: { Startdatum: { date: { start: r.startdatum } }, Enddatum: { date: { start: r.vertragsende } }, Laufzeit: lz } }) });
    if (res.ok) { geschrieben++; await admin.from("kunden_laufzeit_stand").update({ notion_stand: stand, notion_fehler: null }).eq("client_id", r.client_id); }
    else { fehler++; const t = await res.text(); console.error("notion write failed", r.kunde, res.status, t.slice(0, 200)); await admin.from("kunden_laufzeit_stand").update({ notion_fehler: `${res.status}: ${t.slice(0, 200)}` }).eq("client_id", r.client_id); }
  }
  return { status: "verbunden", laufzeit_feldtyp: props["Laufzeit"].type, geschrieben, unveraendert, fehler, ohne_notion_seite: ohneNotion.length };
}
