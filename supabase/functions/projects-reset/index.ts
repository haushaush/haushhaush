import { createClient } from "npm:@supabase/supabase-js@2";
import { closeForPipeline, cors, json } from "../_shared/bonusClose.ts";
import { loadActiveCustomers } from "../_shared/activeCustomers.ts";
import { CF } from "../_shared/closeAbschluesse.ts";
import { mergeServices, PROJECT_TYPES, resetCounts } from "../_shared/projectReset.ts";

const UPSELL_SERVICES = "cf_jgeLLARF6nrKr1bxhsoNCgOUX2VGpcxsTtyXBEdiv80";
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
async function key() { const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!secret) throw new Error("Vorschau-Signierung nicht verfügbar."); return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
async function sign(payload: unknown) { const body = b64(enc.encode(JSON.stringify(payload))); return `${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body))))}`; }
async function verify(token: string) { const [body, sig] = token.split("."); if (!body || !sig || !(await crypto.subtle.verify("HMAC", await key(), unb64(sig), enc.encode(body)))) throw new Error("Vorschau ist ungültig."); const p = JSON.parse(new TextDecoder().decode(unb64(body))); if (!p.exp || Date.now() > p.exp) throw new Error("Vorschau ist abgelaufen. Bitte neu laden."); return p; }

async function sourcePlan(admin: any) {
  const { call, pipeline } = await closeForPipeline();
  const leads = await loadActiveCustomers(admin, call);
  const missingLinks = leads.filter(l => !l.client).map(l => l.display_name || l.id);
  const salesIds = new Set((pipeline.statuses || []).map((s: any) => s.id));
  const customers: any[] = [];
  // Close reads only. A failed page aborts the entire preview, never a partial plan.
  for (const lead of leads) {
    const won: any[] = [];
    for (let skip = 0; ; skip += 100) {
      const live = await call(`/opportunity/?lead_id=${encodeURIComponent(lead.id)}&_limit=100&_skip=${skip}`);
      won.push(...(live.data || []).filter((o: any) => o.status_type === "won" && salesIds.has(o.status_id)));
      if (!live.has_more) break;
    }
    won.sort((a, b) => String(b[`custom.${CF.startdatum}`] || b.date_won || b.date_updated || "").localeCompare(String(a[`custom.${CF.startdatum}`] || a.date_won || a.date_updated || "")) || String(a.id).localeCompare(String(b.id)));
    const current = won[0];
    const services = mergeServices(current?.[`custom.${CF.leistungen}`], current?.[`custom.${UPSELL_SERVICES}`]);
    const client = lead.client;
    customers.push({ client_id: client?.id || null, close_lead_id: lead.id, name: client?.name || lead.display_name, opportunity_id: current?.id || null, services, projects: client ? services.map(name => ({ client_id: client.id, close_lead_id: lead.id, notion_id: client.notion_id, name, type: PROJECT_TYPES.includes(name) ? name : null })) : [] });
  }
  customers.sort((a, b) => a.name.localeCompare(b.name, "de"));
  const duplicateClients = customers.filter((c, i) => c.client_id && customers.findIndex(x => x.client_id === c.client_id) !== i).map(c => c.name);
  return { projects: customers.flatMap(c => c.projects), customers, without_services: customers.filter(c => !c.services.length).map(c => c.name), missing_links: [...missingLinks, ...duplicateClients] };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return json({ error: "Nicht angemeldet." }, 401);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: auth.user.id, _role: "admin" }); if (!isAdmin) return json({ error: "Nur Admins dürfen Projekte neu aufsetzen." }, 403);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "execute") {
      const plan = await verify(String(body.token || ""));
      if (plan.actor !== auth.user.id || plan.missing_links?.length) throw new Error("Vorschau kann nicht ausgeführt werden. Bitte neu laden und Zuordnungen prüfen.");
      // Re-read Close before the transaction: changing memberships/services invalidates the preview.
      const fresh = await sourcePlan(admin);
      if (JSON.stringify(fresh) !== JSON.stringify(plan.source)) throw new Error("Close-Daten wurden seit der Vorschau geändert. Bitte Vorschau neu laden.");
      const { data, error } = await admin.rpc("projects_reset_execute", { p_actor: auth.user.id, p_fingerprint: plan.fingerprint, p_plan: { projects: plan.source.projects, customers: plan.source.customers, without_services: plan.source.without_services } });
      if (error) throw new Error(error.message); return json({ ok: true, result: data });
    }
    if (body.action !== "preview") return json({ error: "Unbekannte Aktion." }, 400);
    const source = await sourcePlan(admin);
    const { data: snapshot, error } = await admin.rpc("projects_reset_snapshot"); if (error) throw new Error(error.message);
    const counts = resetCounts(snapshot.projects || [], source.projects);
    const token = source.missing_links.length ? null : await sign({ source, fingerprint: snapshot.fingerprint, missing_links: source.missing_links, actor: auth.user.id, exp: Date.now() + 15 * 60_000 });
    return json({ preview: { ...counts, active_customers: source.customers.length, customers: source.customers, without_services: source.without_services, missing_links: source.missing_links, status: "Laufzeitbetreuung" }, token });
  } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 409); }
});