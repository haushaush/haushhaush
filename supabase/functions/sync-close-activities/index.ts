import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const MAX_ITEMS = 1000;
const PAGE = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
  const url = path.startsWith("http") ? path : `${CLOSE_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (res.status === 429) {
    if (attempt > 3) throw new Error("Rate limited");
    await sleep(800 * attempt);
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

    // Determine since: max(last_activities_synced_at) or 30 days ago
    const { data: maxRow } = await supabase
      .from("close_link")
      .select("last_activities_synced_at")
      .order("last_activities_synced_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let since = thirtyDaysAgo;
    if (maxRow?.last_activities_synced_at) {
      const last = new Date(maxRow.last_activities_synced_at);
      // Use last sync only if newer than 30d
      if (last > thirtyDaysAgo) since = last;
    }
    const sinceIso = since.toISOString();
    console.log(`[step:acts] since=${sinceIso}, links=${leadToClient.size}`);

    let upserted = 0;
    const errors: string[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore && upserted < MAX_ITEMS) {
      await sleep(80);
      const data = await closeFetch(`/activity/?date_created__gte=${encodeURIComponent(sinceIso)}&_limit=${PAGE}&_skip=${skip}`);
      const items: any[] = data.data || [];
      for (let a of items) {
        const bodyText: string = a.body_text || a.body_preview || a.body_html || a.note || a.text || "";
        const row = {
          close_activity_id: a.id,
          close_lead_id: a.lead_id,
          client_id: a.lead_id ? leadToClient.get(a.lead_id) || null : null,
          activity_type: a._type || a.type || null,
          direction: a.direction || null,
          subject: a.subject || null,
          body_preview: bodyText ? bodyText.slice(0, 500) : null,
          duration_seconds: a.duration ?? null,
          user_name: a.user_name || null,
          date_created: a.date_created || null,
          synced_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("close_activities").upsert(row, { onConflict: "close_activity_id" });
        if (error) errors.push(`${a.id}: ${error.message}`);
        else upserted++;
        a = null as any;
      }
      hasMore = items.length === PAGE;
      skip += PAGE;
      console.log(`[step:acts] skip=${skip}, upserted=${upserted}, mem ${mem()}MB`);
    }

    await supabase.from("close_link").update({ last_activities_synced_at: new Date().toISOString() }).not("id", "is", null);

    const summary = { upserted, errors: errors.length, since: sinceIso, duration_ms: Date.now() - t0, mem_mb: mem() };
    console.log("[sync-close-activities]", summary);
    return new Response(JSON.stringify({ success: true, ...summary, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-close-activities] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
