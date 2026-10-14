import { createClient } from "npm:@supabase/supabase-js@2";
import { closeForPipeline, cors, json } from "../_shared/bonusClose.ts";
import { loadActiveCustomers } from "../_shared/activeCustomers.ts";

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth } = await admin.auth.getUser((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!auth.user) return json({ error: "Nicht angemeldet." }, 401);
  const { data: allowed } = await admin.rpc("user_has_permission", { target_user_id: auth.user.id, requested_permission_key: "clients.laufzeiten.view" });
  if (!allowed) return json({ error: "Keine Berechtigung für Laufzeiten." }, 403);
  try {
    const { call } = await closeForPipeline();
    const active = await loadActiveCustomers(admin, call);
    const missing = active.filter(l => !l.client);
    if (missing.length) throw new Error(`Aktive Close-Kunden ohne Kundenverknüpfung: ${missing.map(l => l.display_name).join(", ")}. Bitte zuerst zuordnen.`);
    const { data: runtime, error } = await admin.from("kunden_laufzeit_stand").select("*");
    if (error) throw new Error(error.message);
    const byId = new Map((runtime || []).map((r: any) => [r.client_id, r]));
    return json({ rows: active.map(l => ({ ...(byId.get(l.client.id) || {}), client_id: l.client.id, kunde: l.client.name || l.display_name, close_lead_id: l.id, close_status_label: l.status_label })) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 502); }
});