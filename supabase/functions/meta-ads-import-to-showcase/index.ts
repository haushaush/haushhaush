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

function resolveCreativeUrls(creative: any): { thumbnail_url: string | null; ad_format: string } {
  if (!creative) return { thumbnail_url: null, ad_format: "image" };
  const story = creative.object_story_spec || {};
  const videoData = story.video_data;
  const linkData = story.link_data;
  const photoData = story.photo_data;
  let thumbnail_url: string | null = null;
  let ad_format = "image";

  if (creative.video_id || videoData?.video_id) {
    ad_format = "video";
    thumbnail_url =
      videoData?.image_url ||
      videoData?.image_hash_url ||
      creative.image_url ||
      creative.thumbnail_url ||
      null;
  } else if (linkData?.child_attachments?.length > 0) {
    ad_format = "carousel";
    const first = linkData.child_attachments[0];
    thumbnail_url = first.picture || first.image_url || creative.image_url || creative.thumbnail_url || null;
  } else if (linkData?.picture || creative.image_url) {
    ad_format = "image";
    thumbnail_url = linkData?.picture || creative.image_url || creative.thumbnail_url || null;
  } else if (photoData?.url) {
    ad_format = "image";
    thumbnail_url = photoData.url;
  } else {
    thumbnail_url = creative.image_url || creative.thumbnail_url || null;
  }
  return { thumbnail_url, ad_format };
}

async function fetchVideoSource(videoId: string): Promise<string | null> {
  if (!videoId) return null;
  try {
    const data = await metaGet(`/${videoId}`, { fields: "source,permalink_url" });
    return data?.source ?? null;
  } catch (e) {
    console.warn(`fetchVideoSource failed for ${videoId}:`, e);
    return null;
  }
}

async function persistThumbnail(metaUrl: string | null, adId: string, svc: any): Promise<string | null> {
  if (!metaUrl) return null;
  try {
    const resp = await fetch(metaUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const buffer = new Uint8Array(await blob.arrayBuffer());
    const ext = (blob.type || "image/jpeg").split("/")[1]?.split("+")[0] || "jpg";
    const filename = `meta-ads/${adId}.${ext === "jpeg" ? "jpg" : ext}`;
    const { error } = await svc.storage
      .from("referenz-showcase")
      .upload(filename, buffer, {
        contentType: blob.type || "image/jpeg",
        upsert: true,
      });
    if (error) {
      console.error("Storage upload failed:", error);
      return null;
    }
    const { data } = svc.storage.from("referenz-showcase").getPublicUrl(filename);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error("persistThumbnail error:", e);
    return null;
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
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { adIds, datePreset = "maximum" } = await req.json();
    if (!Array.isArray(adIds) || adIds.length === 0) throw new Error("adIds required");

    const imported: string[] = [];
    const errors: { id: string; error: string }[] = [];

    const { data: links } = await svc.from("kunde_meta_accounts").select("kunde_id, meta_account_id");
    const linkMap = new Map<string, string>();
    (links ?? []).forEach((l: any) => linkMap.set(l.meta_account_id, l.kunde_id));

    for (const adId of adIds) {
      try {
        const fields = [
          "id", "name", "status", "effective_status", "account_id",
          "campaign_id", "campaign{name}",
          "adset_id", "adset{name}",
          "creative{id,name,object_type,image_url,thumbnail_url,video_id,asset_feed_spec,object_story_spec,effective_object_story_id}",
        ].join(",");
        const ad = await metaGet(`/${adId}`, { fields });
        const insightsRes = await metaGet(`/${adId}/insights`, {
          fields: "spend,impressions,clicks,ctr,cpm,actions,action_values,date_start,date_stop",
          date_preset: datePreset,
        });
        const insightRow = insightsRes?.data?.[0];
        const metrics = extractMetrics(insightRow);
        const creative = ad.creative ?? {};
        const { thumbnail_url: rawThumb, ad_format } = resolveCreativeUrls(creative);

        // Video source
        let video_url: string | null = null;
        const videoId = creative.video_id || creative.object_story_spec?.video_data?.video_id;
        if (videoId) {
          video_url = await fetchVideoSource(videoId);
        }

        // Persist thumbnail
        const persistedThumb = await persistThumbnail(rawThumb, ad.id, svc);

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
          ad_format,
          thumbnail_url: persistedThumb || rawThumb,
          thumbnail_url_meta: rawThumb,
          thumbnail_url_persisted: persistedThumb,
          video_url,
          meta_metrics: metrics,
          campaign_period_start: insightRow?.date_start ?? null,
          campaign_period_end: insightRow?.date_stop ?? null,
          metrics_last_refreshed_at: new Date().toISOString(),
          linked_kunde_id: linkedKunde,
          created_by: userId,
          filter_values: ad_format ? { format: ad_format } : {},
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
