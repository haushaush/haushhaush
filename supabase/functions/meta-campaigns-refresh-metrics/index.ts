// Refresh metrics, status, period for one or all imported campaigns
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enrichAdData } from "../_shared/showcase-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const API_VERSION = "v19.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

async function metaGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("access_token", ACCESS_TOKEN!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Meta API ${res.status}`);
  return data;
}

function extractMetrics(row: any) {
  if (!row) return null;
  const leadAction = (row.actions ?? []).find((a: any) =>
    ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"].includes(a.action_type));
  const purchaseValue = (row.action_values ?? []).find((a: any) =>
    ["purchase", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type));
  const leads = leadAction ? Number(leadAction.value) : 0;
  const spend = Number(row.spend ?? 0);
  return {
    spend,
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: row.ctr ? +Number(row.ctr).toFixed(2) : null,
    cpm: row.cpm ? +Number(row.cpm).toFixed(2) : null,
    reach: row.reach ? Number(row.reach) : null,
    frequency: row.frequency ? +Number(row.frequency).toFixed(2) : null,
    leads,
    cpl: leads > 0 ? +(spend / leads).toFixed(2) : null,
    roas: purchaseValue && spend > 0 ? +(Number(purchaseValue.value) / spend).toFixed(2) : null,
    conversions: leads,
  };
}

async function countChildren(campaignId: string, edge: "ads" | "adsets"): Promise<number> {
  try {
    const res = await metaGet(`/${campaignId}/${edge}`, {
      fields: "id",
      limit: "200",
      summary: "true",
    });
    if (typeof res?.summary?.total_count === "number") return res.summary.total_count;
    return Array.isArray(res?.data) ? res.data.length : 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN not configured");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { campaignId, datePreset = "lifetime" } = await req.json().catch(() => ({}));

    let query = svc
      .from("referenz_meta_campaigns")
      .select("id, meta_campaign_id, meta_account_id, meta_account_name, filter_values, custom_tags");
    if (campaignId) query = query.eq("id", campaignId);
    const { data: rows } = await query;
    if (!rows?.length) {
      return new Response(JSON.stringify({ refreshed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let count = 0;
    for (const r of rows as any[]) {
      try {
        const camp = await metaGet(`/${r.meta_campaign_id}`, {
          fields: "id,name,objective,status,effective_status,start_time,stop_time",
        });
        const ins = await metaGet(`/${r.meta_campaign_id}/insights`, {
          fields: "spend,impressions,clicks,ctr,cpm,reach,frequency,actions,action_values,date_start,date_stop",
          date_preset: datePreset,
        });
        const row = ins?.data?.[0];
        const metrics = extractMetrics(row);

        const [adsCount, adsetsCount] = await Promise.all([
          countChildren(r.meta_campaign_id, "ads"),
          countChildren(r.meta_campaign_id, "adsets"),
        ]);

        const enrichment = await enrichAdData(
          svc,
          { meta_account_id: r.meta_account_id, meta_account_name: r.meta_account_name },
          { ...(r.filter_values ?? {}) },
          r.custom_tags ?? [],
        );

        const periodStart = row?.date_start ?? (camp.start_time ? camp.start_time.split("T")[0] : null);
        const periodEnd = row?.date_stop ?? (camp.stop_time ? camp.stop_time.split("T")[0] : null);

        await svc.from("referenz_meta_campaigns").update({
          meta_campaign_name: camp.name,
          meta_objective: camp.objective ?? null,
          meta_status: camp.effective_status ?? camp.status ?? null,
          metrics,
          campaign_period_start: periodStart,
          campaign_period_end: periodEnd,
          metrics_last_refreshed_at: new Date().toISOString(),
          total_ads_count: adsCount,
          total_adsets_count: adsetsCount,
          filter_values: enrichment.filter_values,
          custom_tags: enrichment.custom_tags,
          linked_kunde_id: enrichment.linked_kunde_id,
        }).eq("id", r.id);
        count++;
      } catch (e) {
        console.error("refresh campaign error", r.meta_campaign_id, e);
      }
    }

    return new Response(JSON.stringify({ refreshed: count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meta-campaigns-refresh", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
