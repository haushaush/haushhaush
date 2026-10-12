// Builds the running customer list (bonus_kunden_aktuell) from Won opportunities in the sales pipeline,
// and on request freezes the month snapshot (bonus_kunden_snapshot) from it — only if that month has no snapshot yet.
import { createClient } from "npm:@supabase/supabase-js@2";
import { berlinDate, checkCron, closeForPipeline, cors, currentMonthBerlin, json, oppsByStatus, requireManager, resolveClients } from "../_shared/bonusClose.ts";

async function refreshAktuell(admin: any) {
  const { call, pipeline } = await closeForPipeline();
  const wonIds = (pipeline.statuses || []).filter((s: any) => s.type === "won").map((s: any) => s.id);
  if (!wonIds.length) throw new Error("Kein Won-Status in der Sales-Pipeline gefunden");
  const opps: any[] = [];
  for (const id of wonIds) opps.push(...await oppsByStatus(call, id));

  const { data: mas } = await admin.from("bonus_mitarbeiter").select("id, close_user_id").eq("aktiv", true);
  const byUser = new Map((mas || []).filter((m: any) => m.close_user_id).map((m: any) => [m.close_user_id, m.id]));
  const nutzer: Record<string, number> = {};
  opps.forEach((o) => (nutzer[o.user_id || "–"] = (nutzer[o.user_id || "–"] || 0) + 1));
  const mine = opps.filter((o) => byUser.has(o.user_id));

  const leadToClient = await resolveClients(admin, call, [...new Set(mine.map((o) => o.lead_id))], new Map(mine.map((o) => [o.lead_id, o.lead_name])));
  const now = new Date().toISOString();
  const rows = mine.map((o) => ({
    mitarbeiter_id: byUser.get(o.user_id), client_id: leadToClient.get(o.lead_id) ?? null, close_lead_id: o.lead_id,
    close_opportunity_id: o.id, lead_name: o.lead_name, seit: o.date_won ? String(o.date_won).slice(0, 10) : null, aktiv: true, zuletzt_gesehen_am: now,
  }));
  if (rows.length) {
    const { error } = await admin.from("bonus_kunden_aktuell").upsert(rows, { onConflict: "close_opportunity_id" });
    if (error) throw new Error("Schreiben fehlgeschlagen: " + error.message);
  }
  const { error: dErr } = await admin.from("bonus_kunden_aktuell").update({ aktiv: false }).lt("zuletzt_gesehen_am", now).eq("aktiv", true);
  if (dErr) throw new Error("Deaktivieren fehlgeschlagen: " + dErr.message);
  return { won_gesamt: opps.length, won_nach_close_user: nutzer, laufende_liste: rows.length, ohne_kunde: rows.filter((r) => !r.client_id).map((r) => r.lead_name) };
}

async function freezeSnapshot(admin: any, monat: string) {
  const { data: mas } = await admin.from("bonus_mitarbeiter").select("id").eq("aktiv", true);
  const out: any[] = [];
  for (const m of mas || []) {
    const { count } = await admin.from("bonus_kunden_snapshot").select("id", { count: "exact", head: true }).eq("monat", monat).eq("mitarbeiter_id", m.id);
    if (count) { out.push({ mitarbeiter_id: m.id, uebersprungen: true, bestehend: count }); continue; }
    const { data: akt } = await admin.from("bonus_kunden_aktuell").select("client_id").eq("mitarbeiter_id", m.id).eq("aktiv", true).not("client_id", "is", null);
    const ids = [...new Set((akt || []).map((a: any) => a.client_id))];
    if (ids.length) {
      const { error } = await admin.from("bonus_kunden_snapshot").insert(ids.map((client_id) => ({ monat, mitarbeiter_id: m.id, client_id })));
      if (error) throw new Error("Snapshot fehlgeschlagen: " + error.message);
    }
    out.push({ mitarbeiter_id: m.id, eingefroren: ids.length });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "bonus_kunden_sync");
  if (cron === false) return json({ error: "unauthorized" }, 401);
  if (cron === null) { const g = await requireManager(req, admin, createClient); if (!g.ok) return g.res!; }
  let body: any = {};
  try { body = await req.json(); } catch { /* cron */ }
  const snapshot = body?.aktion === "snapshot";
  const monat = currentMonthBerlin();
  const { data: log } = await admin.from("bonus_sync_log").insert({ sync_typ: snapshot ? "kunden_snapshot" : "kunden_aktuell", ausloeser: cron ? "cron" : "manuell", monat }).select("id").single();
  try {
    const r: any = await refreshAktuell(admin);
    if (snapshot) r.snapshot = await freezeSnapshot(admin, monat);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: true, gefunden: r.laufende_liste, nicht_zuordenbar: r.ohne_kunde.map((n: string) => ({ name: n, grund: "Close-Lead ohne zugeordneten Kunden" })) }).eq("id", log.id);
    return json({ ok: true, monat, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bonus-kunden-sync failed", msg);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: false, fehler: msg }).eq("id", log.id);
    return json({ ok: false, error: msg }, 502);
  }
});
