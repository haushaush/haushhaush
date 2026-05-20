import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
  const url = path.startsWith("http") ? path : `${CLOSE_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 401) throw new Error("Close API key invalid (401)");
  if (res.status === 429) {
    if (attempt > 3) throw new Error("Rate limited after 3 retries");
    await sleep(1000 * Math.pow(2, attempt));
    return closeFetch(path, attempt + 1);
  }
  if (res.status >= 500) {
    if (attempt > 2) throw new Error(`Close 5xx after retries: ${res.status}`);
    await sleep(500 * attempt);
    return closeFetch(path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Close ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let clientId: string | null = null;
    try {
      const body = await req.json();
      if (body?.client_id) clientId = String(body.client_id);
    } catch { /* no body */ }

    // 1. Load clients
    let clientsQuery = supabase.from("clients").select("id, name, email").not("email", "is", null);
    if (clientId) clientsQuery = clientsQuery.eq("id", clientId);
    const { data: clients, error: cErr } = await clientsQuery;
    if (cErr) throw cErr;

    // 2. Existing close_link
    const { data: existingLinks } = await supabase.from("close_link").select("client_id, close_lead_id");
    const linkedClientIds = new Set((existingLinks || []).map((l) => l.client_id));

    let newlyMatched = 0;
    let unmatched = 0;
    let ambiguous = 0;
    const errors: string[] = [];

    // 3. Match unlinked
    for (const c of clients || []) {
      if (linkedClientIds.has(c.id)) continue;
      if (!c.email) continue;
      try {
        await sleep(260);
        const q = encodeURIComponent(`email:"${c.email}"`);
        const result = await closeFetch(`/lead/?query=${q}&_limit=2`);
        const leads = result.data || [];
        if (leads.length === 1) {
          const { error } = await supabase.from("close_link").insert({
            client_id: c.id,
            close_lead_id: leads[0].id,
            matched_via: "email",
            match_confidence: 1.0,
            last_synced_at: new Date().toISOString(),
          });
          if (error) {
            if (error.code === "23505") {
              // already linked (race)
            } else {
              errors.push(`link ${c.name}: ${error.message}`);
            }
          } else {
            newlyMatched++;
          }
        } else if (leads.length === 0) {
          unmatched++;
          console.log(`[unmatched] ${c.name}, ${c.email}`);
        } else {
          ambiguous++;
          console.log(`[ambiguous] ${c.name}, ${c.email}`);
        }
      } catch (e: any) {
        if (e.message?.includes("401")) throw e;
        errors.push(`match ${c.name}: ${e.message}`);
      }
    }

    // Refresh lead->client map
    const { data: allLinks } = await supabase.from("close_link").select("client_id, close_lead_id");
    const leadToClient = new Map<string, string>();
    (allLinks || []).forEach((l) => leadToClient.set(l.close_lead_id, l.client_id));

    // 4. Sync opportunities (batch)
    let oppsUpserted = 0;
    let skip = 0;
    let hasMore = true;
    while (hasMore && skip < 10000) {
      await sleep(260);
      const data = await closeFetch(`/opportunity/?_limit=100&_skip=${skip}`);
      const items = data.data || [];
      for (const o of items) {
        const valueCents =
          typeof o.value === "number" ? Math.round(o.value * 100) :
          typeof o.value === "string" ? Math.round(parseFloat(o.value) * 100) : null;
        const row = {
          id: o.id,
          lead_id: o.lead_id,
          lead_name: o.lead_name || null,
          client_id: leadToClient.get(o.lead_id) || null,
          status_type: o.status_type || null,
          status_label: o.status_label || null,
          status_id: o.status_id || null,
          pipeline_id: o.pipeline_id || null,
          pipeline_name: o.pipeline_name || null,
          value: o.value ?? null,
          value_cents: valueCents,
          value_formatted: o.value_formatted || null,
          value_currency: o.value_currency || null,
          value_period: o.value_period || null,
          note: o.note || null,
          confidence: o.confidence ?? null,
          user_name: o.user_name || null,
          date_won: o.date_won || null,
          date_lost: o.date_lost || null,
          date_created: o.date_created || null,
          date_updated: o.date_updated || null,
          raw: o,
          synced_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("close_opportunities").upsert(row, { onConflict: "id" });
        if (error) errors.push(`opp ${o.id}: ${error.message}`);
        else oppsUpserted++;
      }
      hasMore = items.length === 100;
      skip += 100;
    }

    // 5. Activities (last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    let actsUpserted = 0;
    skip = 0;
    hasMore = true;
    while (hasMore && skip < 20000) {
      await sleep(260);
      const data = await closeFetch(`/activity/?date_created__gte=${encodeURIComponent(since)}&_limit=100&_skip=${skip}`);
      const items = data.data || [];
      for (const a of items) {
        const bodyText: string =
          a.body_text || a.body_preview || a.body_html || a.note || a.text || "";
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
          raw_data: a,
          synced_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("close_activities").upsert(row, { onConflict: "close_activity_id" });
        if (error) errors.push(`act ${a.id}: ${error.message}`);
        else actsUpserted++;
      }
      hasMore = items.length === 100;
      skip += 100;
    }

    // 6. Update last_synced_at on all close_link rows
    await supabase
      .from("close_link")
      .update({ last_synced_at: new Date().toISOString() })
      .not("id", "is", null);

    const summary = {
      clients_total: clients?.length ?? 0,
      newly_matched: newlyMatched,
      unmatched,
      ambiguous,
      opps_upserted: oppsUpserted,
      activities_upserted: actsUpserted,
      duration_ms: Date.now() - t0,
      errors: errors.length,
      error_samples: errors.slice(0, 5),
    };
    console.log("[Sync Close]", summary);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[sync-close] fatal:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "internal", duration_ms: Date.now() - t0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
