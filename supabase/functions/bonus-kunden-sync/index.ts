// Close is the source of truth for customers. This sync mirrors every Close lead with a client status
// (Aktueller Klient / Pausiert / Ehemaliger Klient) into bonus_kunden_aktuell, links it once to a clients row
// (stored link → exact normalized name → create), writes clients.kundenstatus FROM Close (never back),
// and keeps the current month's bonus_kunden_snapshot in step (added during the month, never silently shrunk
// except for leads an admin excluded via zaehlt_fuer_betreuung).
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkCron, closeClient, HAUSH_KEY, haushKey, cors, currentMonthBerlin, json, requireManager, type Close } from "../_shared/bonusClose.ts";

// Only the Haush Haush Digital account holds Justin's customers and the Client-Checkin type.
// CLOSE_API_KEY belongs to Viral Connect GmbH (separate company) and is deliberately not mirrored.
const ACCOUNTS = [HAUSH_KEY];
const AKTIV = "Aktueller Klient", PAUSIERT = "Pausiert", EHEMALIG = "Ehemaliger Klient";
const LABELS = [AKTIV, PAUSIERT, EHEMALIG];
const betreut = (l: string | null) => l === AKTIV || l === PAUSIERT;
const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function statusIds(call: Close) {
  const st = await call(`/status/lead/`);
  const m = new Map<string, string>();
  for (const s of st.data || []) if (LABELS.includes(s.label)) m.set(s.label, s.id);
  if (!m.has(AKTIV)) throw new Error(`Status „${AKTIV}" im Close-Account nicht gefunden`);
  return m;
}

async function leadsWithStatus(call: Close, label: string) {
  const out: any[] = [];
  for (let skip = 0; ; skip += 100) {
    const p = await call(`/lead/?query=${encodeURIComponent(`lead_status:"${label}"`)}&_fields=id,display_name,status_label,date_created&_limit=100&_skip=${skip}`);
    out.push(...(p.data || []));
    if (!p.has_more) break;
  }
  return out.filter((l) => l.status_label === label);
}

async function soleMitarbeiter(admin: any) {
  const { data } = await admin.from("bonus_mitarbeiter").select("id").eq("aktiv", true);
  return data?.length === 1 ? data[0].id : null;
}

export async function refreshAktuell(admin: any) {
  const now = new Date().toISOString();
  const maId = await soleMitarbeiter(admin);
  const report: any = { konten: {}, neu_angelegt: [], per_name: [], status_geaendert: [], nicht_mehr_klient: [] };
  const { data: existing } = await admin.from("bonus_kunden_aktuell").select("id, close_account, close_lead_id, client_id, zuordnung_quelle, aktiv, close_status_label");
  const byKey = new Map((existing || []).map((r: any) => [`${r.close_account}|${r.close_lead_id}`, r]));
  const [{ data: kcd }, { data: cl }, { data: clients }] = await Promise.all([
    admin.from("kunde_close_deals").select("kunde_id, close_lead_id").not("close_lead_id", "is", null),
    admin.from("close_link").select("client_id, close_lead_id"),
    admin.from("clients").select("id, name, kundenstatus").is("deleted_at", null).limit(10000),
  ]);
  const stored = new Map<string, { id: string; via: string }>();
  (cl || []).forEach((r: any) => stored.set(r.close_lead_id, { id: r.client_id, via: "close_link" }));
  (kcd || []).forEach((r: any) => r.kunde_id && !stored.has(r.close_lead_id) && stored.set(r.close_lead_id, { id: r.kunde_id, via: "kunde_close_deals" }));
  const clientById = new Map((clients || []).map((c: any) => [c.id, c]));
  const byName = new Map<string, string[]>();
  for (const c of clients || []) { const k = norm(c.name || ""); if (k) byName.set(k, [...(byName.get(k) || []), c.id]); }
  const taken = new Set((existing || []).map((r: any) => r.client_id).filter(Boolean));

  for (const acc of ACCOUNTS) {
    const key = Deno.env.get(acc);
    if (!key) throw new Error(`${acc} ist nicht gesetzt`);
    const call = closeClient(key);
    await statusIds(call);
    const leads: any[] = [];
    for (const label of LABELS) leads.push(...await leadsWithStatus(call, label));
    report.konten[acc] = Object.fromEntries(LABELS.map((l) => [l, leads.filter((x) => x.status_label === l).length]));
    const seen = new Set<string>();
    for (const lead of leads) {
      seen.add(lead.id);
      const prev: any = byKey.get(`${acc}|${lead.id}`);
      let clientId: string | null = prev?.client_id ?? null, quelle: string | null = prev?.zuordnung_quelle ?? null;
      if (!clientId) {
        const s = stored.get(lead.id);
        if (s && clientById.has(s.id)) { clientId = s.id; quelle = s.via; }
        else {
          const hit = (byName.get(norm(lead.display_name || "")) || []).filter((id) => !taken.has(id));
          if (hit.length === 1) { clientId = hit[0]; quelle = "name"; report.per_name.push({ lead: lead.display_name, kunde: clientById.get(hit[0])?.name }); }
          else {
            const { data: nc, error } = await admin.from("clients").insert({ name: lead.display_name || lead.id, kundenstatus: betreut(lead.status_label) ? "In Betreuung" : "Churned" }).select("id, name, kundenstatus").single();
            if (error) throw new Error(`Kunde „${lead.display_name}" anlegen fehlgeschlagen: ${error.message}`);
            clientId = nc.id; quelle = "neu_angelegt"; clientById.set(nc.id, nc); report.neu_angelegt.push(lead.display_name);
          }
        }
        taken.add(clientId);
      }
      const row = { close_account: acc, close_lead_id: lead.id, lead_name: lead.display_name, close_status_label: lead.status_label, client_id: clientId, zuordnung_quelle: quelle, aktiv: betreut(lead.status_label), zuletzt_gesehen_am: now, updated_at: now, seit: prev ? undefined : String(lead.date_created || now).slice(0, 10), mitarbeiter_id: maId };
      if (prev) delete (row as any).seit;
      const { error } = await admin.from("bonus_kunden_aktuell").upsert(row, { onConflict: "close_account,close_lead_id" });
      if (error) throw new Error("Schreiben fehlgeschlagen: " + error.message);
      const want = betreut(lead.status_label) ? "In Betreuung" : "Churned";
      const c: any = clientById.get(clientId!);
      if (c && c.kundenstatus !== want) {
        const { error: uErr } = await admin.from("clients").update({ kundenstatus: want }).eq("id", clientId);
        if (uErr) throw new Error("Kundenstatus schreiben fehlgeschlagen: " + uErr.message);
        report.status_geaendert.push({ kunde: c.name, von: c.kundenstatus, nach: want }); c.kundenstatus = want;
      }
    }
    // Leads that no longer carry any client status in Close: mirror that.
    for (const r of (existing || []).filter((r: any) => r.close_account === acc && !seen.has(r.close_lead_id) && r.close_status_label !== "kein Klient" && !String(r.close_status_label || "").includes("(kein Klient)") && r.close_status_label !== "in Close gelöscht")) {
      let label = "kein Klient";
      try { const l = await call(`/lead/${r.close_lead_id}/?_fields=status_label`); label = l.status_label ? `${l.status_label} (kein Klient)` : label; } catch { label = "in Close gelöscht"; }
      await admin.from("bonus_kunden_aktuell").update({ aktiv: false, close_status_label: label, updated_at: now }).eq("id", r.id);
      report.nicht_mehr_klient.push({ lead: r.close_lead_id, status: label });
    }
  }
  // One-way mirror: every CRM customer marked as betreut without a betreut Close lead is downgraded, every run.
  const { data: akt } = await admin.from("bonus_kunden_aktuell").select("client_id, close_status_label").not("client_id", "is", null);
  const wantBy = new Map<string, string>();
  for (const a of akt || []) {
    const w = betreut(a.close_status_label) ? "In Betreuung" : a.close_status_label === EHEMALIG ? "Churned" : "Offen";
    const prev = wantBy.get(a.client_id);
    if (!prev || w === "In Betreuung" || (w === "Churned" && prev === "Offen")) wantBy.set(a.client_id, w);
  }
  report.ohne_close_lead = [];
  for (const c of clientById.values() as any) {
    if (!BETREUT_CRM.includes(c.kundenstatus)) continue;
    const w = wantBy.get(c.id);
    if (w === "In Betreuung") continue;
    const nach = w ?? "Offen";
    const { error } = await admin.from("clients").update({ kundenstatus: nach }).eq("id", c.id);
    if (error) throw new Error("Kundenstatus schreiben fehlgeschlagen: " + error.message);
    report.status_geaendert.push({ kunde: c.name, von: c.kundenstatus, nach, grund: w ? "Close: kein Klienten-Status" : "kein Close-Lead" });
    if (!w) report.ohne_close_lead.push({ kunde: c.name, client_id: c.id });
    c.kundenstatus = nach;
  }
  const { count } = await admin.from("bonus_kunden_aktuell").select("id", { count: "exact", head: true }).eq("aktiv", true).eq("zaehlt_fuer_betreuung", true);
  report.laufende_liste = count ?? 0;
  return report;
}
const BETREUT_CRM = ["In Betreuung", "Onboarding", "Pausiert"];

// ── Full lead mirror (every status, 1:1). Never deletes. Incremental via status_change activities ──
const MARKE_CF = "cf_1aHYMjs2T5cmcIWApGI2MVBUDYVsW41UGhFVMboLoQ7";
const LEAD_FIELDS = `id,display_name,status_id,status_label,date_created,date_updated,custom,custom.${MARKE_CF}`;
const pickCustom = (c: Record<string, any>, re: RegExp) => {
  const k = Object.keys(c || {}).find((x) => re.test(x));
  const v = k ? c[k] : null;
  return v == null || v === "" ? null : Array.isArray(v) ? v.join(", ") : String(v);
};
const leadRow = (l: any, now: string) => ({
  close_lead_id: l.id, name: l.display_name, status_id: l.status_id, status_label: l.status_label,
  marke: l[`custom.${MARKE_CF}`] || null,
  branche: pickCustom(l.custom, /^branche$/i) ?? pickCustom(l.custom, /branche/i),
  sub_niche: pickCustom(l.custom, /sub.?nisch|sub.?niche/i),
  kanal: pickCustom(l.custom, /^kanal|kanal/i),
  custom: l.custom || {}, date_created: l.date_created, date_updated: l.date_updated, synced_at: now,
});

async function upsertLeads(admin: any, rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("close_lead_spiegel").upsert(rows.slice(i, i + 500), { onConflict: "close_lead_id" });
    if (error) throw new Error("Lead-Spiegel schreiben fehlgeschlagen: " + error.message);
  }
}

export async function mirrorLeads(admin: any, forceVoll: boolean) {
  const call = closeClient(haushKey());
  const startedAt = new Date().toISOString();
  const { data: st } = await admin.from("close_sync_stand").select("*").eq("name", "close_leads").maybeSingle();
  const tag = startedAt.slice(0, 10);
  const voll = forceVoll || !st?.letzter_erfolg || !st?.letzter_voll || String(st.letzter_voll).slice(0, 10) !== tag;
  const rep: any = { modus: voll ? "voll" : "aenderungen", leads: 0, statuswechsel: 0 };
  try {
    if (voll) {
      const rows: any[] = [];
      for (let skip = 0; ; skip += 200) {
        const p = await call(`/lead/?_fields=${LEAD_FIELDS}&_limit=200&_skip=${skip}`);
        rows.push(...(p.data || []).map((l: any) => leadRow(l, startedAt)));
        if (!p.has_more) break;
      }
      await upsertLeads(admin, rows);
      rep.leads = rows.length;
    }
    // Status changes since last success (on first run: last 400 days as history).
    const since = st?.letzter_erfolg ? new Date(new Date(st.letzter_erfolg).getTime() - 5 * 60000).toISOString() : new Date(Date.now() - 400 * 86400000).toISOString();
    const changes: any[] = [];
    for (let skip = 0; ; skip += 100) {
      const p = await call(`/activity/status_change/lead/?date_created__gte=${encodeURIComponent(since)}&_limit=100&_skip=${skip}`);
      changes.push(...(p.data || []));
      if (!p.has_more) break;
    }
    if (changes.length) {
      const ch = changes.map((a: any) => ({ close_activity_id: a.id, close_lead_id: a.lead_id, von_label: a.old_status_label, nach_label: a.new_status_label, datum: a.date_created, geaendert_von: a.user_name || null }));
      for (let i = 0; i < ch.length; i += 500) {
        const { error } = await admin.from("close_lead_statuswechsel").upsert(ch.slice(i, i + 500), { onConflict: "close_activity_id" });
        if (error) throw new Error("Statuswechsel schreiben fehlgeschlagen: " + error.message);
      }
      rep.statuswechsel = ch.length;
    }
    if (!voll) {
      // Leads with a status change or created/updated since the last run: refetch them individually.
      const ids = new Set<string>(changes.map((a: any) => a.lead_id));
      const day = since.slice(0, 10);
      for (const q of [`created >= "${day}"`, `updated >= "${day}"`]) {
        for (let skip = 0; ; skip += 200) {
          const p = await call(`/lead/?query=${encodeURIComponent(q)}&_fields=id,date_updated&_limit=200&_skip=${skip}`);
          for (const l of p.data || []) if (!l.date_updated || l.date_updated >= since) ids.add(l.id);
          if (!p.has_more) break;
        }
      }
      const rows: any[] = [];
      for (const id of ids) rows.push(leadRow(await call(`/lead/${encodeURIComponent(id)}/?_fields=${LEAD_FIELDS}`), startedAt));
      await upsertLeads(admin, rows);
      rep.leads = rows.length;
    }
    // Latest status-change date per lead.
    const { data: last } = await admin.from("close_lead_statuswechsel").select("close_lead_id, datum").gte("datum", since).order("datum", { ascending: true });
    const latest = new Map<string, string>(); (last || []).forEach((r: any) => latest.set(r.close_lead_id, r.datum));
    for (const [id, d] of latest) await admin.from("close_lead_spiegel").update({ status_geaendert_am: d }).eq("close_lead_id", id);
    const { count } = await admin.from("close_lead_spiegel").select("close_lead_id", { count: "exact", head: true });
    rep.gesamt_im_spiegel = count;
    await admin.from("close_sync_stand").upsert({ name: "close_leads", letzter_erfolg: startedAt, letzter_voll: voll ? startedAt : st?.letzter_voll ?? null, letzter_lauf: new Date().toISOString(), ok: true, fehler: null, details: rep });
    return rep;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("close_sync_stand").upsert({ name: "close_leads", letzter_erfolg: st?.letzter_erfolg ?? null, letzter_voll: st?.letzter_voll ?? null, letzter_lauf: new Date().toISOString(), ok: false, fehler: msg, details: rep });
    throw new Error("Lead-Spiegel: " + msg);
  }
}

/** Snapshot only grows: anyone betreut at any point in the month stays. Never deletes rows. */
export async function reconcileSnapshot(admin: any, monat: string) {
  const { data: mas } = await admin.from("bonus_mitarbeiter").select("id").eq("aktiv", true);
  const { data: akt } = await admin.from("bonus_kunden_aktuell").select("client_id, mitarbeiter_id, zaehlt_fuer_betreuung, aktiv").not("client_id", "is", null);
  const out: any[] = [];
  for (const m of mas || []) {
    const { data: bm } = await admin.from("bonus_monate").select("status").eq("monat", monat).eq("mitarbeiter_id", m.id).maybeSingle();
    if (bm?.status === "freigegeben") { out.push({ mitarbeiter_id: m.id, uebersprungen: "Monat freigegeben" }); continue; }
    const mine = (akt || []).filter((a: any) => !a.mitarbeiter_id || a.mitarbeiter_id === m.id);
    const add = [...new Set(mine.filter((a: any) => a.aktiv && a.zaehlt_fuer_betreuung).map((a: any) => a.client_id))];
    if (add.length) {
      const { error } = await admin.from("bonus_kunden_snapshot").upsert(add.map((client_id) => ({ monat, mitarbeiter_id: m.id, client_id })), { onConflict: "monat,mitarbeiter_id,client_id", ignoreDuplicates: true });
      if (error) throw new Error("Snapshot fehlgeschlagen: " + error.message);
    }
    const { count } = await admin.from("bonus_kunden_snapshot").select("id", { count: "exact", head: true }).eq("monat", monat).eq("mitarbeiter_id", m.id);
    out.push({ mitarbeiter_id: m.id, im_snapshot: count });
  }
  return out;
}

async function adminAction(admin: any, body: any) {
  if (body.aktion === "zaehlt") {
    const { error } = await admin.from("bonus_kunden_aktuell").update({ zaehlt_fuer_betreuung: !!body.wert, updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) throw new Error(error.message);
    // Explicit human exclusion is the only automated-path removal from the running month's snapshot.
    if (!body.wert) {
      const { data: r } = await admin.from("bonus_kunden_aktuell").select("client_id").eq("id", body.id).single();
      if (r?.client_id) await admin.from("bonus_kunden_snapshot").delete().eq("monat", currentMonthBerlin()).eq("client_id", r.client_id);
    }
    return { snapshot: await reconcileSnapshot(admin, currentMonthBerlin()) };
  }
  if (body.aktion === "zuordnen") {
    const { data: r } = await admin.from("bonus_kunden_aktuell").select("id, client_id, zuordnung_quelle").eq("id", body.id).single();
    const { data: dup } = await admin.from("bonus_kunden_aktuell").select("id").eq("client_id", body.client_id).neq("id", body.id);
    if (dup?.length) throw new Error("Dieser Kunde ist bereits einem anderen Close-Lead zugeordnet");
    const { error } = await admin.from("bonus_kunden_aktuell").update({ client_id: body.client_id, zuordnung_quelle: "manuell", updated_at: new Date().toISOString() }).eq("id", body.id);
    if (error) throw new Error(error.message);
    if (r?.client_id && r.client_id !== body.client_id) {
      const monat = currentMonthBerlin();
      const { data: rows } = await admin.from("bonus_kunden_snapshot").select("id, mitarbeiter_id").eq("monat", monat).eq("client_id", r.client_id);
      for (const s of rows || []) {
        await admin.from("bonus_kunden_snapshot").delete().eq("id", s.id);
        await admin.from("bonus_kunden_snapshot").upsert({ monat, mitarbeiter_id: s.mitarbeiter_id, client_id: body.client_id }, { onConflict: "monat,mitarbeiter_id,client_id", ignoreDuplicates: true });
      }
      await admin.from("bonus_checkins").update({ client_id: body.client_id }).eq("client_id", r.client_id).eq("quelle", "close");
      // A customer we created automatically only as a stand-in is retired once a human picked the real one.
      if (r.zuordnung_quelle === "neu_angelegt") await admin.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", r.client_id);
    }
    const { data: c } = await admin.from("clients").select("kundenstatus").eq("id", body.client_id).single();
    const { data: me } = await admin.from("bonus_kunden_aktuell").select("close_status_label").eq("id", body.id).single();
    const want = betreut(me?.close_status_label) ? "In Betreuung" : me?.close_status_label === EHEMALIG ? "Churned" : null;
    if (want && c?.kundenstatus !== want) await admin.from("clients").update({ kundenstatus: want }).eq("id", body.client_id);
    return { ok: true };
  }
  if (body.aktion === "uebernehmen") {
    const { data: k } = await admin.from("bonus_checkin_kandidaten").select("*").eq("id", body.kandidat_id).single();
    if (!k) throw new Error("Einsendung nicht gefunden");
    const call = closeClient(haushKey());
    const ids = await statusIds(call);
    await call(`/lead/${encodeURIComponent(k.close_lead_id)}/`, "PUT", { status_id: ids.get(AKTIV) });
    const r = await refreshAktuell(admin);
    const snapshot = await reconcileSnapshot(admin, currentMonthBerlin());
    await admin.from("bonus_checkin_kandidaten").update({ status: "uebernommen", bearbeitet_von: body._uid, bearbeitet_am: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("close_lead_id", k.close_lead_id).eq("status", "offen");
    return { ...r, snapshot };
  }
  throw new Error("unbekannte Aktion");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "bonus_kunden_sync");
  if (cron === false) return json({ error: "unauthorized" }, 401);
  let uid: string | null = null;
  if (cron === null) {
    const g = await requireManager(req, admin, createClient); if (!g.ok) return g.res!;
    const { data: u } = await admin.auth.getUser((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")); uid = u?.user?.id ?? null;
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* cron */ }
  if (body?.aktion && body.aktion !== "snapshot") {
    try { return json({ ok: true, ...(await adminAction(admin, { ...body, _uid: uid })) }); }
    catch (e) { const msg = e instanceof Error ? e.message : String(e); console.error("bonus-kunden-sync action failed", body.aktion, msg); return json({ ok: false, error: msg }, 400); }
  }
  const monat = /^\d{4}-\d{2}-01$/.test(String(body?.monat || "")) ? body.monat : currentMonthBerlin();
  const { data: log } = await admin.from("bonus_sync_log").insert({ sync_typ: "kunden_aktuell", ausloeser: cron ? "cron" : "manuell", monat }).select("id").single();
  try {
    let spiegel: any;
    try { spiegel = await mirrorLeads(admin, !!body?.voll); }
    catch (e) { spiegel = { ok: false, fehler: e instanceof Error ? e.message : String(e) }; console.error("lead mirror failed", spiegel.fehler); }
    const r: any = await refreshAktuell(admin);
    r.lead_spiegel = spiegel;
    r.snapshot = await reconcileSnapshot(admin, monat);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: true, gefunden: r.laufende_liste, neu: r.neu_angelegt.length, details: { status_geaendert: r.status_geaendert, ohne_close_lead: r.ohne_close_lead, nicht_mehr_klient: r.nicht_mehr_klient }, nicht_zuordenbar: r.neu_angelegt.map((n: string) => ({ name: n, grund: "Kein CRM-Kunde gefunden — neu angelegt, bitte prüfen" })) }).eq("id", log.id);
    return json({ ok: true, monat, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bonus-kunden-sync failed", msg);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: false, fehler: msg }).eq("id", log.id);
    return json({ ok: false, error: msg }, 502);
  }
});
