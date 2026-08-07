import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logStep } from "../_shared/closeSales.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY_SALES");
const MAX_ITEMS = 20000;
const PAGE = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

class CloseHttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`Close ${status}: ${body.slice(0, 500)}`);
  }
}

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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CloseHttpError(res.status, body);
  }
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

const CURSOR_KEY = "sales_status_events_cursor";
const TIME_BUDGET_MS = 110_000;
const MAX_PAGES = 200;

/** Postgres gives "2026-08-04 07:36:51.234+00" — Close needs strict ISO 8601. */
function toIso(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Close does not allow filtering /event/ by object_type alone, so we scan the
// event log once and route rows to the right table client-side. Pagination is
// cursor based; the cursor is persisted so each run resumes where it stopped.
async function syncEvents(supabase: any, startCursor: string | null, since: string | null, t0: number) {
  const stats = {
    opportunity: { upserted: 0, errors: [] as string[] },
    lead: { upserted: 0, errors: [] as string[] },
  };
  let scanned = 0;
  let pages = 0;
  let cursor: string | null = startCursor;
  let hasMore = true;
  let stopReason = "exhausted";

  const sinceIso = toIso(since);
  let useDateFilter = Boolean(sinceIso);
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : null;

  while (hasMore && scanned < MAX_ITEMS && pages < MAX_PAGES && Date.now() - t0 < TIME_BUDGET_MS) {
    await sleep(120);
    const buildParams = (withDate: boolean) => {
      const p = new URLSearchParams({ _limit: String(PAGE) });
      if (cursor) p.set("_cursor", cursor);
      if (withDate && sinceIso) p.set("date_updated__gt", sinceIso);
      return p;
    };

    let data: any;
    try {
      data = await closeFetch(`/event/?${buildParams(useDateFilter).toString()}`);
    } catch (e: any) {
      if (useDateFilter && e instanceof CloseHttpError && e.status === 400) {
        console.warn("[events] date filter rejected by Close, falling back to client-side filtering:", e.message);
        useDateFilter = false;
        data = await closeFetch(`/event/?${buildParams(false).toString()}`);
      } else {
        throw e;
      }
    }

    pages++;
    let items: any[] = Array.isArray(data?.data) ? data.data : [];
    if (items.length === 0) {
      stopReason = "empty_page";
      break;
    }
    scanned += items.length;

    // When the server-side filter is unavailable, drop old events locally.
    if (!useDateFilter && sinceMs != null) {
      items = items.filter((ev) => {
        const ts = new Date(ev.date_updated || ev.date_created || 0).getTime();
        return isFinite(ts) && ts > sinceMs;
      });
    }

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

    const next: string | null = data?.cursor_next ?? data?.next_cursor ?? data?.cursor ?? null;
    hasMore = Boolean(next);
    if (next) cursor = next;
    console.log(`[step:events] page=${pages} scanned=${scanned}, opps=${stats.opportunity.upserted}, leads=${stats.lead.upserted}, mem ${mem()}MB`);
  }

  if (pages >= MAX_PAGES) {
    stopReason = "page_limit";
    console.warn(`[events] hard page limit of ${MAX_PAGES} reached — aborting run, cursor persisted`);
  } else if (hasMore) {
    stopReason = "budget";
  }

  return { scanned, pages, cursor, stopReason, done: !hasMore, date_filter_used: useDateFilter, ...stats };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    let startCursor: string | null = null;
    let since: string | null = null;
    if (!body?.reset) {
      const { data } = await supabase.from("app_settings").select("value").eq("key", CURSOR_KEY).maybeSingle();
      startCursor = (data?.value as any)?.cursor ?? null;
      since = (data?.value as any)?.since ?? null;
    }
    if (body?.since) since = String(body.since);
    console.log(`[sync-sales-status-changes] resume cursor=${startCursor ? "yes" : "no"} since=${since ?? "none"}`);

    const res = await syncEvents(supabase, startCursor, since, t0);

    if (res.cursor) {
      await supabase.from("app_settings").upsert(
        { key: CURSOR_KEY, value: { cursor: res.cursor, since, updated_at: new Date().toISOString() } },
        { onConflict: "key" },
      );
    }

    // Close event rows carry no pipeline info — backfill it from the synced
    // opportunities so the funnel views (pipeline_name = 'Sales') match.
    const { data: missing } = await supabase
      .from("sales_status_changes")
      .select("id, opportunity_id")
      .is("pipeline_name", null)
      .limit(5000);
    if (missing && missing.length > 0) {
      const ids = [...new Set(missing.map((r: any) => r.opportunity_id).filter(Boolean))];
      const { data: opps } = await supabase
        .from("sales_opportunities")
        .select("id, pipeline_id, pipeline_name")
        .in("id", ids);
      let patched = 0;
      for (const o of opps || []) {
        const { error, count } = await supabase
          .from("sales_status_changes")
          .update({ pipeline_id: o.pipeline_id, pipeline_name: o.pipeline_name }, { count: "exact" })
          .eq("opportunity_id", o.id)
          .is("pipeline_name", null);
        if (error) console.error("[backfill]", error.message);
        else patched += count ?? 0;
      }
      console.log(`[backfill] pipeline_name set on ${patched} rows`);
    }




    const allErrors = [...res.opportunity.errors, ...res.lead.errors];
    const summary = {
      scanned: res.scanned,
      pages: res.pages,
      stop_reason: res.stopReason,
      date_filter_used: res.date_filter_used,
      done: res.done,
      opportunities: { upserted: res.opportunity.upserted, errors: res.opportunity.errors.length },
      leads: { upserted: res.lead.upserted, errors: res.lead.errors.length },
      duration_ms: Date.now() - t0,
      mem_mb: mem(),
    };
    console.log("[sync-sales-status-changes]", summary);

    await logStep(
      supabase,
      "status_changes",
      res.opportunity.upserted + res.lead.upserted,
      allErrors.length,
      Date.now() - t0,
      allErrors[0] ?? null,
    );

    return new Response(
      JSON.stringify({ success: true, ...summary, error_samples: allErrors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );


  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 500);
    console.error("[sync-sales-status-changes] fatal:", msg);
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await logStep(supabase, "status_changes", 0, 1, Date.now() - t0, msg);
    } catch { /* logging must never mask the original error */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
