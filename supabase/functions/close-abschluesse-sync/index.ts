// Mirrors every opportunity of the Close "Sales" pipeline (Haush-Haush account only) into close_abschluesse,
// derives contract runtimes for every betreut customer into kunden_laufzeit_stand (never guesses),
// writes complete runtimes into clients and pushes them one-way to Notion. Close → CRM → Notion, never back.
import { createClient } from "npm:@supabase/supabase-js@2";
import { mapContext, mapOpp, pushNotion, syncLaufzeiten } from "../_shared/closeAbschluesse.ts";
import { checkCron, closeForPipeline, json, cors, oppsByStatus, requireManager } from "../_shared/bonusClose.ts";

async function syncAbschluesse(admin: any) {
  const { call, pipeline } = await closeForPipeline();
  const opps: any[] = [];
  for (const s of pipeline.statuses || []) opps.push(...await oppsByStatus(call, s.id));
  const leadIds = [...new Set(opps.map((o) => o.lead_id).filter(Boolean))] as string[];
  const ctx = await mapContext(call, admin, leadIds);
  const rows = opps.map((o) => mapOpp(o, ctx));
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await admin.from("close_abschluesse").upsert(rows.slice(i, i + 300), { onConflict: "close_opportunity_id" });
    if (error) throw new Error("Abschlüsse schreiben fehlgeschlagen: " + error.message);
  }
  return { abschluesse: rows.length, upsell_felder: ctx.upsellFields.map((f: any) => f.name), ohne_lead_im_spiegel: leadIds.filter((l) => !ctx.leads.has(l)).length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "close_abschluesse_sync");
  if (cron === false) return json({ error: "unauthorized" }, 401);
  if (cron === null) { const g = await requireManager(req, admin, createClient); if (!g.ok) return g.res!; }
  const out: any = { ok: true };
  try { out.abschluesse = await syncAbschluesse(admin); }
  catch (e) { out.ok = false; out.abschluesse_fehler = e instanceof Error ? e.message : String(e); console.error("abschluesse failed", out.abschluesse_fehler); }
  try {
    const lz = await syncLaufzeiten(admin);
    const { rows, ...rest } = lz; out.laufzeiten = rest;
    try { out.notion = await pushNotion(admin, rows); } catch (e) { out.notion = { status: "Fehler", details: e instanceof Error ? e.message : String(e) }; }
  } catch (e) { out.ok = false; out.laufzeiten_fehler = e instanceof Error ? e.message : String(e); console.error("laufzeiten failed", out.laufzeiten_fehler); }
  await admin.from("close_sync_stand").upsert({ name: "close_abschluesse", letzter_lauf: new Date().toISOString(), ...(out.ok ? { letzter_erfolg: new Date().toISOString() } : {}), ok: out.ok, fehler: out.abschluesse_fehler || out.laufzeiten_fehler || null, details: out });
  return json(out, out.ok ? 200 : 502);
});
