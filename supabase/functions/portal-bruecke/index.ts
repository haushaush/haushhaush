import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PORTAL = "https://zwvacriyxaxfnhemirkp.supabase.co/functions/v1/crm-bridge";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth } = await admin.auth.getUser((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!auth?.user) return json({ ok: false, error: "Nicht angemeldet." }, 401);
  const token = Deno.env.get("CRM_BRIDGE_TOKEN");
  if (!token) return json({ ok: false, error: "Secret CRM_BRIDGE_TOKEN fehlt" }, 500);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body || (body.action !== "list" && body.action !== "create")) return json({ ok: false, error: "invalid_action" }, 400);
  // Body (inkl. Passwort) wird unverändert weitergereicht und nie geloggt.
  const r = await fetch(PORTAL, { method: "POST", headers: { "Content-Type": "application/json", "x-crm-token": token }, body: JSON.stringify(body) });
  return new Response(await r.text(), { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("Content-Type") || "application/json" } });
});
