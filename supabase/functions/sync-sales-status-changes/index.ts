import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY_SALES");
const MAX_ITEMS = 20000;
const PAGE = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY_SALES missing");
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

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

// Close event-log rows carry the new state in `data` and the old state in `previous_data`.
function mapOpportunityEvent(ev: any) {
  const d = ev.data || {};
  const p = ev.previous_data || {};
  return {
    id: ev.id,
    opportunity_id: str(ev.object_id ?? d.id),
    lead_id: str(d.lead_id ?? p.lead_id),
    pipeline_id: str(d.pipeline_id ?? p.pipeline_id),
    pipeline_name: str(d.pipeline_name ?? p.pipeline_name),
    old_status_id: str(p.status_id),
    old_status_label: str(p.status_label),
    new_status_id: str(d.status_id),
    new_status_label: str(d.status_label),
    new_status_type: str(d.status_type),
    user_id: str(ev.user_id ?? d.user_id),
    user_name: str(ev.user_name ?? d.user_name),
    date_changed: ev.date_updated || ev.date_created,
    synced_at: new Date().toISOString(),
  };
}

function mapLeadEvent(ev: any) {
  const d = ev.data || {};
  const p = ev.previous_data || {};
  return {
    id: ev.id,
    lead_id: str(ev.object_id ?? d.id),
    old_status_id: str(p.status_id),
    old_status_label: str(p.status_label),
    new_status_id: str(d.status_id),
    new_status_label: str(d.status_label),
    new_status_type: str(d.status_type),
    user_id: str(ev.user_id ?? d.user_id),
    user_name: str(ev.user_name ?? d.user_name),
    date_changed: ev.date_updated || ev.date_created,
    synced_at: new Date().toISOString(),
  };
}

function hasStatusChange(ev: any): boolean {
  const changed = ev.changed_fields;
  if (Array.isArray(changed) && changed.length > 0) {
    return changed.some((f: string) => String(f).startsWith("status_id"));
  }
  // created events have no changed_fields but still carry an initial status
  const d = ev.data || {};
  return d.status_id != null;
}

// Close does not allow filtering /event/ by object_type alone, so we scan the
// event log once and route rows to the right table client-side.
async function syncEvents(supabase: any, since: string | null) {
  const stats = {
    opportunity: { upserted: 0, errors: [] as string[] },
    lead: { upserted: 0, errors: [] as string[] },
  };
  let scanned = 0;
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore && scanned < MAX_ITEMS) {
    await sleep(120);
    const params = new URLSearchParams({ _limit: String(PAGE) });
    if (since) params.set("date_updated__gt", since);
    if (cursor) params.set("_cursor", cursor);

    const data = await closeFetch(`/event/?${params.toString()}`);
    const items: any[] = data.data || [];
    scanned += items.length;

    const relevant = items
      .filter((ev) => ev.action === "updated" || ev.action === "created")
      .filter((ev) => ev.object_type === "opportunity" || ev.object_type === "lead")
      .filter(hasStatusChange);

    for (const kind of ["opportunity", "lead"] as const) {
      const table = kind === "opportunity" ? "sales_status_changes" : "sales_lead_status_changes";
      const rows = relevant
        .filter((ev) => ev.object_type === kind)
        .map((ev) => (kind === "opportunity" ? mapOpportunityEvent(ev) : mapLeadEvent(ev)))
        .filter((r) => r.id && r.date_changed);
      if (rows.length === 0) continue;
      const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
      if (error) stats[kind].errors.push(`${table}: ${error.message}`);
      else stats[kind].upserted += rows.length;
    }

    cursor = data.cursor_next || null;
    hasMore = Boolean(data.has_more && cursor);
    console.log(`[step:events] scanned=${scanned}, opps=${stats.opportunity.upserted}, leads=${stats.lead.upserted}, mem ${mem()}MB`);
  }

  return { scanned, ...stats };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const latest = async (table: string): Promise<string | null> => {
      const { data } = await supabase
        .from(table)
        .select("date_changed")
        .order("date_changed", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.date_changed ?? null;
    };

    const [sinceOpps, sinceLeads] = await Promise.all([
      latest("sales_status_changes"),
      latest("sales_lead_status_changes"),
    ]);
    // one shared cursor: take the older of both so nothing is missed
    const since = !sinceOpps || !sinceLeads
      ? null
      : (sinceOpps < sinceLeads ? sinceOpps : sinceLeads);
    console.log(`[sync-sales-status-changes] since=${since}`);

    const res = await syncEvents(supabase, since);

    const summary = {
      scanned: res.scanned,
      opportunities: { upserted: res.opportunity.upserted, errors: res.opportunity.errors.length },
      leads: { upserted: res.lead.upserted, errors: res.lead.errors.length },
      duration_ms: Date.now() - t0,
      mem_mb: mem(),
    };
    console.log("[sync-sales-status-changes]", summary);

    return new Response(
      JSON.stringify({ success: true, ...summary, error_samples: [...res.opportunity.errors, ...res.lead.errors].slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: any) {
    console.error("[sync-sales-status-changes] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
