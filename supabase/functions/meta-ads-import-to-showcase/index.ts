// Import selected Meta Ads into referenz_meta_ads
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

type ImageResolveResult = { url: string | null; strategy: string; details: Record<string, any> };

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

// Upgrade FB CDN URLs to highest resolution variants where possible
function upgradeFbResolution(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/_n\.(jpg|png)/gi, "_o.$1")
    .replace(/_s\.(jpg|png)/gi, "_o.$1")
    .replace(/_t\.(jpg|png)/gi, "_o.$1")
    .replace(/\/p\d+x\d+\//g, "/p1080x1080/")
    .replace(/\/s\d+x\d+\//g, "/s1080x1080/");
}

async function resolveHighResUrl(imageHash: string, accountId: string): Promise<string | null> {
  if (!imageHash) return null;
  try {
    const bareAccountId = accountId.replace(/^act_/, "");
    const url = `${BASE}/act_${bareAccountId}/adimages?hashes=${encodeURIComponent(JSON.stringify([imageHash]))}&fields=hash,url,permalink_url,width,height&access_token=${ACCESS_TOKEN}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok || data.error) {
      console.warn("[resolveHighResUrl] failed:", data.error?.message || resp.status);
      return null;
    }
    const img = Array.isArray(data.data) ? data.data[0] : data.data?.[imageHash];
    console.log(`[resolveHighResUrl] hash=${imageHash} → ${img?.width}×${img?.height}`);
    return img?.permalink_url || img?.url || null;
  } catch (e) {
    console.error("[resolveHighResUrl] exception:", e);
    return null;
  }
}

async function lookupAdImage(hash: string, accountId: string, adId: string): Promise<ImageResolveResult | null> {
  const bareAccountId = accountId.replace(/^act_/, "");
  const lookupUrl = `${BASE}/act_${bareAccountId}/adimages?hashes=${encodeURIComponent(JSON.stringify([hash]))}&fields=hash,url,permalink_url,original_width,original_height,width,height&access_token=${ACCESS_TOKEN}`;
  console.log(`[${adId}] Trying Strategy 4 (adimages lookup) with hash: ${hash}`);
  try {
    const lookupRes = await fetch(lookupUrl);
    const lookupData = await lookupRes.json();
    console.log(`[${adId}] adimages response:`, JSON.stringify(lookupData, null, 2));
    if (!lookupRes.ok || lookupData?.error) {
      console.warn(`[${adId}] adimages lookup failed: ${lookupRes.status}`, lookupData?.error ?? lookupData);
      return null;
    }
    const imagesObj = lookupData?.images || {};
    const imageData = imagesObj[hash] || lookupData?.data?.find?.((img: any) => img.hash === hash) || lookupData?.data?.[0];
    if (!imageData) return null;
    const bestUrl = imageData.permalink_url || imageData.url;
    if (!bestUrl) return null;
    const dimensions = `${imageData.original_width ?? imageData.width ?? "?"}×${imageData.original_height ?? imageData.height ?? "?"}`;
    console.log(`[${adId}] ✓ Strategy 4 found: ${bestUrl.substring(0, 200)} (${dimensions})`);
    return { url: bestUrl, strategy: "adimages", details: { hash, permalink_url: imageData.permalink_url, url: imageData.url, dimensions, raw: imageData } };
  } catch (e) {
    console.error(`[${adId}] adimages exception:`, (e as Error).message);
    return null;
  }
}

async function fetchVideoInfo(videoId: string) {
  try {
    const url = `${BASE}/${videoId}?fields=source,picture,thumbnails{uri,width,height,is_preferred}&access_token=${ACCESS_TOKEN}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) return null;
    const thumbs = data.thumbnails?.data || [];
    const largest = thumbs.sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
    return { source: data.source, picture: data.picture, largestThumbnail: largest?.uri || data.picture };
  } catch {
    return null;
  }
}

async function resolveCreativeUrls(
  creative: any,
  accountId: string,
  adId: string,
): Promise<{ thumbnail_url: string | null; video_url: string | null; ad_format: string; strategy: string; details: Record<string, any> }> {
  if (!creative) return { thumbnail_url: null, video_url: null, ad_format: "image", strategy: "none", details: { reason: "missing creative" } };

  console.log(`[${adId}] Resolving image URL...`);
  console.log(`[${adId}] Available fields:`, {
    has_image_url: !!creative?.image_url,
    has_thumbnail_url: !!creative?.thumbnail_url,
    has_image_hash: !!creative?.image_hash,
    has_object_story_spec: !!creative?.object_story_spec,
    has_photo_data: !!creative?.object_story_spec?.photo_data,
    has_link_data: !!creative?.object_story_spec?.link_data,
    has_asset_feed_spec: !!creative?.asset_feed_spec,
    image_url_sample: creative?.image_url?.substring(0, 200),
  });

  const story = creative.object_story_spec || {};
  const videoData = story.video_data;
  const linkData = story.link_data;
  const photoData = story.photo_data;

  let thumbnail_url: string | null = null;
  let video_url: string | null = null;
  let ad_format = "image";
  let imageHash: string | null = null;
  let videoId: string | null = null;

  if (creative.video_id || videoData?.video_id) {
    ad_format = "video";
    videoId = creative.video_id || videoData?.video_id;
    imageHash = videoData?.image_hash;
  } else if (linkData?.child_attachments?.length > 0) {
    ad_format = "carousel";
    imageHash = linkData.child_attachments[0].image_hash;
  } else if (photoData?.image_hash) {
    ad_format = "image";
    imageHash = photoData.image_hash;
  } else if (linkData?.image_hash) {
    ad_format = "image";
    imageHash = linkData.image_hash;
  } else if (creative.image_hash) {
    ad_format = "image";
    imageHash = creative.image_hash;
  }

  if (photoData?.url) {
    console.log(`[${adId}] ✓ Strategy 1 (photo_data.url): ${photoData.url.substring(0, 200)}`);
    return { thumbnail_url: photoData.url, video_url, ad_format, strategy: "photo_data", details: { photoUrl: photoData.url } };
  }

  if (linkData?.picture) {
    const upgraded = upgradeFbResolution(linkData.picture);
    console.log(`[${adId}] ✓ Strategy 2 (link_data.picture): ${upgraded?.substring(0, 200)}`);
    return { thumbnail_url: upgraded, video_url, ad_format, strategy: "link_data", details: { original: linkData.picture, upgraded } };
  }

  const feedImg = creative.asset_feed_spec?.images?.[0]?.url;
  if (feedImg) {
    console.log(`[${adId}] ✓ Strategy 3 (asset_feed_spec): ${feedImg.substring(0, 200)}`);
    return { thumbnail_url: feedImg, video_url, ad_format, strategy: "asset_feed", details: { feedImage: feedImg } };
  }

  if (imageHash) {
    const adImage = await lookupAdImage(imageHash, accountId, adId);
    if (adImage) return { thumbnail_url: adImage.url, video_url, ad_format, strategy: adImage.strategy, details: adImage.details };
  }

  if (videoId) {
    const videoInfo = await fetchVideoInfo(videoId);
    video_url = videoInfo?.source || null;
    if (videoInfo?.largestThumbnail) {
      console.log(`[${adId}] ✓ Strategy 5 (video thumbnail): ${videoInfo.largestThumbnail.substring(0, 200)}`);
      return { thumbnail_url: videoInfo.largestThumbnail, video_url, ad_format, strategy: "video_thumbnail", details: { videoId, picture: videoInfo.picture, largestThumbnail: videoInfo.largestThumbnail } };
    }
  }

  if (creative.thumbnail_url) {
    const upgraded = upgradeFbResolution(creative.thumbnail_url);
    console.log(`[${adId}] ⚠ Strategy 6 (thumbnail_url): ${upgraded?.substring(0, 200)}`);
    return { thumbnail_url: upgraded, video_url, ad_format, strategy: "thumbnail", details: { original: creative.thumbnail_url, upgraded } };
  }

  if (creative.image_url) {
    const upgraded = upgradeFbResolution(creative.image_url);
    console.log(`[${adId}] ⚠⚠ Strategy 7 FALLBACK (image_url): ${upgraded?.substring(0, 200)}`);
    return { thumbnail_url: upgraded, video_url, ad_format, strategy: "image_url_fallback", details: { original: creative.image_url, upgraded } };
  }

  console.error(`[${adId}] ✗ All strategies failed`);
  return { thumbnail_url: null, video_url, ad_format, strategy: "none", details: { creative } };
}

async function persistThumbnail(metaUrl: string | null, adId: string, svc: any): Promise<string | null> {
  if (!metaUrl) return null;
  console.log(`[persistThumbnail] Fetching: ${metaUrl.substring(0, 100)}...`);
  try {
    const resp = await fetch(metaUrl);
    if (!resp.ok) { console.warn(`[persistThumbnail] Fetch failed: ${resp.status}`); return null; }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();
    const byteLength = arrayBuffer.byteLength;
    console.log(`[persistThumbnail] Downloaded ${byteLength} bytes (${contentType})`);

    if (byteLength < 5000) {
      console.warn(`[persistThumbnail] REFUSING tiny image (${byteLength} bytes) — likely 64x64 thumbnail`);
      return null;
    }

    const filename = `meta-ads/${adId}.jpg`;
    const { error } = await svc.storage.from("referenz-showcase").upload(filename, new Uint8Array(arrayBuffer), {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) { console.error("[persistThumbnail] Upload failed:", error); return null; }
    const { data } = svc.storage.from("referenz-showcase").getPublicUrl(filename);
    console.log(`[persistThumbnail] Uploaded: ${data?.publicUrl}`);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error("[persistThumbnail] Exception:", e);
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

    // Sync filter options from Notion first so any new branche/unternehmen is available
    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-showcase-filters-from-notion`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
    } catch (e) {
      console.warn("[import] filter sync failed (non-fatal):", (e as Error).message);
    }

    const imported: string[] = [];
    const errors: { id: string; error: string }[] = [];

    const creativeFields = [
      "id", "name", "object_type",
      "image_url", "thumbnail_url", "image_hash",
      "video_id",
      "object_story_spec{video_data{video_id,image_url,image_hash},link_data{picture,image_hash,child_attachments{picture,image_hash}},photo_data{url,image_hash}}",
      "asset_feed_spec",
      "effective_object_story_id",
    ].join(",");

    for (const adId of adIds) {
      try {
        const fields = [
          "id", "name", "status", "effective_status", "account_id",
          "campaign_id", "campaign{name}",
          "adset_id", "adset{name}",
          `creative{${creativeFields}}`,
        ].join(",");
        const ad = await metaGet(`/${adId}`, { fields });
        const insightsRes = await metaGet(`/${adId}/insights`, {
          fields: "spend,impressions,clicks,ctr,cpm,actions,action_values,date_start,date_stop",
          date_preset: datePreset,
        });
        const insightRow = insightsRes?.data?.[0];
        const metrics = extractMetrics(insightRow);
        const creative = ad.creative ?? {};
        const accId = `act_${ad.account_id}`;
        const { thumbnail_url: rawThumb, video_url, ad_format } = await resolveCreativeUrls(creative, accId);

        const persistedThumb = await persistThumbnail(rawThumb, ad.id, svc);

        let accountName = "";
        try {
          const acc = await metaGet(`/${accId}`, { fields: "name" });
          accountName = acc?.name ?? "";
        } catch { /* ignore */ }

        // Preserve any existing manual edits (tags, filter values) when re-importing
        const { data: existing } = await svc
          .from("referenz_meta_ads")
          .select("filter_values, custom_tags")
          .eq("meta_ad_id", ad.id)
          .maybeSingle();

        const baseFilterValues: Record<string, any> = {
          ...(existing?.filter_values ?? {}),
          ...(ad_format ? { format: ad_format } : {}),
        };
        const baseTags: string[] = existing?.custom_tags ?? [];

        const enrichment = await enrichAdData(
          svc,
          { meta_account_id: accId, meta_account_name: accountName },
          baseFilterValues,
          baseTags,
        );

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
          linked_kunde_id: enrichment.linked_kunde_id,
          custom_tags: enrichment.custom_tags,
          filter_values: enrichment.filter_values,
          created_by: userId,
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
