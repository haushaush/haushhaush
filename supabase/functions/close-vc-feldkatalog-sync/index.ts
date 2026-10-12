// Reads (never writes) the opportunity field catalog of the Viral Connect Close account (CLOSE_API_KEY)
// into close_vc_feldkatalog, so Noah's field ids in close_opportunities.custom_fields resolve to names.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkCron, closeClient, cors, json, requireManager } from "../_shared/bonusClose.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "close_vc_feldkatalog_sync");
  if (cron === false) return json({ error: "unauthorized" }, 401);
  if (cron === null) { const g = await requireManager(req, admin, createClient); if (!g.ok) return g.res!; }
  const key = Deno.env.get("CLOSE_API_KEY");
  if (!key) return json({ error: "CLOSE_API_KEY (Viral Connect) fehlt" }, 500);
  try {
    const call = closeClient(key);
    const r = await call(`/custom_field/opportunity/?_limit=200`); // GET only
    const now = new Date().toISOString();
    const rows = (r.data || []).map((f: any) => ({ id: f.id, name: f.name, typ: f.type, mehrfach: !!f.accepts_multiple_values, aktualisiert_am: now }));
    const { error } = await admin.from("close_vc_feldkatalog").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return json({ ok: true, felder: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("vc feldkatalog", msg);
    return json({ ok: false, error: msg }, 502);
  }
});
