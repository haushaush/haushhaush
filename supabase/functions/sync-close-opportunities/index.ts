import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const MAX_ITEMS = 20000;
const PAGE = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: allLinks } = await supabase.from("close_link").select("client_id, close_lead_id");
    const leadToClient = new Map<string, string>();
    (allLinks || []).forEach((l) => leadToClient.set(l.close_lead_id, l.client_id));

    let upserted = 0;
    const errors: string[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore && upserted < MAX_ITEMS) {
      await sleep(80);
      const data = await closeFetch(`/opportunity/?_limit=${PAGE}&_skip=${skip}`);
      const items: any[] = data.data || [];
      for (let item of items) {
        const valueCents =
          typeof item.value === "number" ? Math.round(item.value * 100) :
          typeof item.value === "string" ? Math.round(parseFloat(item.value) * 100) : null;

        const CF_KEY = "cf_KLOXVrMLTeGZr5bAU1rsNE9rGtIhpdRy6hIVbsBK17G";
        const rawAbschluss =
          item[`custom.${CF_KEY}`] ??
          (item.custom && typeof item.custom === "object" ? item.custom[CF_KEY] : undefined);
        let abschlusswert: number | null = null;
        if (rawAbschluss != null && rawAbschluss !== "") {
          if (typeof rawAbschluss === "number") {
            abschlusswert = isFinite(rawAbschluss) ? rawAbschluss : null;
          } else {
            const s = String(rawAbschluss).trim().replace(/[^\d,.\-]/g, "");
            let normalized = s;
            if (s.includes(",") && s.includes(".")) {
              normalized = s.replace(/\./g, "").replace(",", ".");
            } else if (s.includes(",")) {
              normalized = s.replace(/\./g, "").replace(",", ".");
            }
            const n = parseFloat(normalized);
            abschlusswert = isFinite(n) ? n : null;
          }
        }

        const row = {
          id: item.id,
          lead_id: item.lead_id,
          lead_name: item.lead_name || null,
          client_id: leadToClient.get(item.lead_id) || null,
          status_type: item.status_type || null,
          status_label: item.status_label || null,
          
          pipeline_id: item.pipeline_id || null,
          pipeline_name: item.pipeline_name || null,
          value: item.value ?? null,
          value_cents: valueCents,
          value_formatted: item.value_formatted || null,
          value_currency: item.value_currency || null,
          value_period: item.value_period || null,
          abschlusswert,
          note: item.note || null,
          confidence: item.confidence ?? null,
          user_name: item.user_name || null,
          date_won: item.date_won || null,
          date_lost: item.date_lost || null,
          date_created: item.date_created || null,
          date_updated: item.date_updated || null,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("close_opportunities").upsert(row, { onConflict: "id" });
        if (error) errors.push(`${item.id}: ${error.message}`);
        else upserted++;
        item = null as any;
      }
      hasMore = items.length === PAGE;
      skip += PAGE;
      console.log(`[step:opps] skip=${skip}, upserted=${upserted}, mem ${mem()}MB`);
    }

    const summary = { upserted, errors: errors.length, duration_ms: Date.now() - t0, mem_mb: mem() };
    console.log("[sync-close-opportunities]", summary);
    return new Response(JSON.stringify({ success: true, ...summary, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-close-opportunities] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
