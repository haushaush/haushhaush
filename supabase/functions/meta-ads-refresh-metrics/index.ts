// Refresh meta_metrics for one or all imported ads
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    ctr: row.ctr ? Number(row.ctr) : null,
    cpm: row.cpm ? Number(row.cpm) : null,
    leads,
    cpl: leads > 0 ? +(spend / leads).toFixed(2) : null,
    roas: purchaseValue && spend > 0 ? +(Number(purchaseValue.value) / spend).toFixed(2) : null,
  };
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

    const { adId, datePreset = "maximum" } = await req.json().catch(() => ({}));

    let query = svc.from("referenz_meta_ads").select("id, meta_ad_id");
    if (adId) query = query.eq("id", adId);
    const { data: rows } = await query;
    if (!rows?.length) return new Response(JSON.stringify({ refreshed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let count = 0;
    for (const r of rows) {
      try {
        const ins = await metaGet(`/${r.meta_ad_id}/insights`, {
          fields: "spend,impressions,clicks,ctr,cpm,actions,action_values,date_start,date_stop",
          date_preset: datePreset,
        });
        const row = ins?.data?.[0];
        const metrics = extractMetrics(row);
        await svc.from("referenz_meta_ads").update({
          meta_metrics: metrics,
          campaign_period_start: row?.date_start ?? null,
          campaign_period_end: row?.date_stop ?? null,
          metrics_last_refreshed_at: new Date().toISOString(),
        }).eq("id", r.id);
        count++;
      } catch (e) {
        console.error("refresh error", r.meta_ad_id, e);
      }
    }
    return new Response(JSON.stringify({ refreshed: count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("meta-ads-refresh", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
