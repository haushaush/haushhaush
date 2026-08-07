// Shared helpers for the SECOND Close account (Haush Haush Digital UG).
// Uses CLOSE_API_KEY_SALES only — never CLOSE_API_KEY.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const CLOSE_BASE = "https://api.close.com/api/v1";
export const MAX_ITEMS = 20000;
export const PAGE = 100;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

export async function closeFetch(path: string, attempt = 1): Promise<any> {
  const key = Deno.env.get("CLOSE_API_KEY_SALES");
  if (!key) throw new Error("CLOSE_API_KEY_SALES missing");
  const auth = btoa(`${key}:`);
  const url = path.startsWith("http") ? path : `${CLOSE_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (res.status === 429) {
    if (attempt > 6) throw new Error("Rate limited");
    await sleep(1000 * attempt);
    return closeFetch(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Close ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const str = (v: unknown): string | null =>
  v == null || v === "" ? null : Array.isArray(v) ? (v.length ? String(v[0]) : null) : String(v);

export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[^\d,.\-]/g, "");
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = parseFloat(normalized);
  return isFinite(n) ? n : null;
};

export const int = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

export const dateOnly = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export const arr = (v: unknown): string[] | null => {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return [String(v)];
};

/** Map of custom-field name -> cf_id for one object type. */
export type CfMap = Map<string, string>;

export async function loadCfMap(supabase: any, objectType: string): Promise<CfMap> {
  const { data } = await supabase
    .from("sales_custom_field_map")
    .select("cf_id, name")
    .eq("object_type", objectType);
  const m: CfMap = new Map();
  (data || []).forEach((r: any) => {
    if (r.name) m.set(String(r.name).trim().toLowerCase(), r.cf_id);
  });
  return m;
}

/** Read a custom field value by its human name from a Close API object. */
export function cf(item: any, map: CfMap, name: string): unknown {
  const id = map.get(name.trim().toLowerCase());
  if (!id) return null;
  const bare = id.startsWith("cf_") ? id : `cf_${id}`;
  return (
    item[`custom.${bare}`] ??
    item[`custom.${id}`] ??
    (item.custom && typeof item.custom === "object" ? item.custom[bare] ?? item.custom[id] : undefined) ??
    null
  );
}

export async function logStep(
  supabase: any,
  step: string,
  upserted: number,
  errors: number,
  duration_ms: number,
) {
  await supabase.from("sales_sync_log").insert({ step, upserted, errors, duration_ms });
}
