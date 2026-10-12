// Shared Close helpers for the bonus syncs (churn + customer list).
// Picks whichever configured Close account contains the given sales pipeline.
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};
export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export const SALES_PIPELINE_ID = "pipe_2iHEJ0WqobTUmfdBqu1tGt";
const CLOSE = "https://api.close.com/api/v1";
export class CloseError extends Error {}

export type Close = (path: string, method?: string, body?: unknown) => Promise<any>;

export function closeClient(apiKey: string): Close {
  const auth = "Basic " + btoa(`${apiKey}:`);
  return async function call(path, method = "GET", body) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(CLOSE + path, {
        method,
        headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 429) {
        const wait = Number(r.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((res) => setTimeout(res, Math.min(wait, 30) * 1000));
        continue;
      }
      const text = await r.text();
      if (!r.ok) throw new CloseError(`Close API ${r.status} bei ${method} ${path.split("?")[0]}: ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : {};
    }
    throw new CloseError(`Close API Rate-Limit bei ${path.split("?")[0]} nach 5 Versuchen`);
  };
}

// Haush Haush Digital is the only Close account for all bonus data. No fallback to any other account.
export const HAUSH_KEY = "CLOSE_API_KEY_SALES";
export function haushKey(): string {
  const k = Deno.env.get(HAUSH_KEY);
  if (!k) throw new CloseError(`Haush-Haush-Close-Zugang (${HAUSH_KEY}) ist nicht gesetzt`);
  return k;
}
export async function closeForPipeline(): Promise<{ call: Close; pipeline: any }> {
  const c = closeClient(haushKey());
  const l = await c(`/pipeline/`);
  const p = (l.data || []).find((x: any) => x.id === SALES_PIPELINE_ID);
  if (!p) throw new CloseError(`Pipeline ${SALES_PIPELINE_ID} im Haush-Haush-Close-Zugang nicht gefunden`);
  return { call: c, pipeline: p };
}

export async function oppsByStatus(call: Close, statusId: string): Promise<any[]> {
  const out: any[] = [];
  let skip = 0;
  while (true) {
    const page = await call(`/opportunity/?status_id=${statusId}&_limit=100&_skip=${skip}`);
    out.push(...(page.data || []));
    if (!page.has_more) break;
    skip += 100;
  }
  return out;
}

export const berlinDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(iso));
export const currentMonthBerlin = () => berlinDate(new Date().toISOString()).slice(0, 7) + "-01";
const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve Close lead ids → client ids: stored links first, then exact normalized name match on lead/contact names. */
export async function resolveClients(admin: any, call: Close, leadIds: string[], leadNames: Map<string, string>) {
  const res = new Map<string, string>();
  if (!leadIds.length) return res;
  const [{ data: l1 }, { data: l2 }, { data: l3 }, { data: cl }] = await Promise.all([
    admin.from("close_link").select("client_id, close_lead_id").in("close_lead_id", leadIds),
    admin.from("close_leads").select("client_id, id").in("id", leadIds),
    admin.from("kunde_close_deals").select("kunde_id, close_lead_id").in("close_lead_id", leadIds),
    admin.from("clients").select("id, name").is("deleted_at", null).limit(5000),
  ]);
  (l1 || []).forEach((r: any) => r.client_id && res.set(r.close_lead_id, r.client_id));
  (l2 || []).forEach((r: any) => r.client_id && !res.has(r.id) && res.set(r.id, r.client_id));
  (l3 || []).forEach((r: any) => r.kunde_id && !res.has(r.close_lead_id) && res.set(r.close_lead_id, r.kunde_id));
  const byName = new Map<string, string[]>();
  for (const c of cl || []) { if (!c.name) continue; const k = norm(c.name); byName.set(k, [...(byName.get(k) || []), c.id]); }
  for (const lid of leadIds) {
    if (res.has(lid)) continue;
    const lead = await call(`/lead/${encodeURIComponent(lid)}/?_fields=id,display_name,name,contacts`);
    const names = [lead.display_name, lead.name, ...((lead.contacts || []).map((c: any) => c.name)), leadNames.get(lid)].filter(Boolean).map((x: string) => norm(x));
    for (const n of names) { const hit = byName.get(n); if (hit?.length === 1) { res.set(lid, hit[0]); break; } }
  }
  return res;
}

export async function requireManager(req: Request, admin: any, createClient: any) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return { ok: false, res: json({ error: "unauthorized" }, 401) };
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: can } = await uc.rpc("bonus_can_manage");
  if (!can) return { ok: false, res: json({ error: "forbidden" }, 403) };
  return { ok: true, res: null };
}

export async function checkCron(admin: any, req: Request, name: string) {
  const t = req.headers.get("x-cron-token");
  if (!t) return null;
  const { data } = await admin.from("bonus_cron_tokens").select("token").eq("name", name).maybeSingle();
  return !!data?.token && data.token === t;
}
