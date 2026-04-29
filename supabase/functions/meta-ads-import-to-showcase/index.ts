// Import selected Meta Ads into referenz_meta_ads
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

function extractMetrics(insightRow: any) {
  if (!insightRow) return null;
  const leadAction = (insightRow.actions ?? []).find((a: any) =>
    ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"].includes(a.action_type)
  );
  const purchaseValue = (insightRow.action_values ?? []).find((a: any) =>
    ["purchase", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type)
  );
  const leads = leadAction ? Number(leadAction.value) : 0;
  const spend = Number(insightRow.spend ?? 0);
  return {
    spend,
    impressions: Number(insightRow.impressions ?? 0),
    clicks: Number(insightRow.clicks ?? 0),
    ctr: insightRow.ctr ? Number(insightRow.ctr) : null,
    cpm: insightRow.cpm ? Number(insightRow.cpm) : null,
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
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub;
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { adIds, datePreset = "maximum" } = await req.json();
    if (!Array.isArray(adIds) || adIds.length === 0) throw new Error("adIds required");

    const imported: string[] = [];
    const errors: { id: string; error: string }[] = [];

    // Auto-link map: meta_account_id -> kunde_id
    const { data: links } = await svc.from("kunde_meta_accounts").select("kunde_id, meta_account_id");
    const linkMap = new Map<string, string>();
    (links ?? []).forEach((l: any) => linkMap.set(l.meta_account_id, l.kunde_id));

    for (const adId of adIds) {
      try {
        const fields = [
          "id", "name", "status", "effective_status", "account_id",
          "campaign_id", "campaign{name}",
          "adset_id", "adset{name}",
          "creative{id,thumbnail_url,image_url,video_id}",
        ].join(",");
        const ad = await metaGet(`/${adId}`, { fields });
        const insightsRes = await metaGet(`/${adId}/insights`, {
          fields: "spend,impressions,clicks,ctr,cpm,actions,action_values,date_start,date_stop",
          date_preset: datePreset,
        });
        const insightRow = insightsRes?.data?.[0];
        const metrics = extractMetrics(insightRow);
        const creative = ad.creative ?? {};
        const adFormat = creative.video_id ? "video" : "image";

        // Account name
        let accountName = "";
        try {
          const acc = await metaGet(`/act_${ad.account_id}`, { fields: "name" });
          accountName = acc?.name ?? "";
        } catch { /* ignore */ }

        const accId = `act_${ad.account_id}`;
        const linkedKunde = linkMap.get(accId) ?? null;

        const { error } = await svc.from("referenz_meta_ads").upsert({
          meta_ad_id: ad.id,
          meta_ad_name: ad.name,
          meta_account_id: accId,
          meta_account_name: accountName,
          meta_campaign_id: ad.campaign_id,
          meta_campaign_name: ad.campaign?.name,
          meta_adset_id: ad.adset_id,
          meta_adset_name: ad.adset?.name,
          meta_creative_id: creative.id,
          ad_format: adFormat,
          thumbnail_url: creative.thumbnail_url || creative.image_url || null,
          meta_metrics: metrics,
          campaign_period_start: insightRow?.date_start ?? null,
          campaign_period_end: insightRow?.date_stop ?? null,
          metrics_last_refreshed_at: new Date().toISOString(),
          linked_kunde_id: linkedKunde,
          created_by: userId,
          filter_values: adFormat ? { format: adFormat } : {},
        }, { onConflict: "meta_ad_id" });

        if (error) errors.push({ id: adId, error: error.message });
        else imported.push(adId);
      } catch (e) {
        errors.push({ id: adId, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ imported, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meta-ads-import", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
