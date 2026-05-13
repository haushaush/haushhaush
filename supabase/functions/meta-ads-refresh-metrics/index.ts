// Refresh meta_metrics + creative URLs for one or all imported ads
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

function upgradeFbResolution(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/_n\.(jpg|png|webp)/gi, "_o.$1")
    .replace(/_s\.(jpg|png|webp)/gi, "_o.$1")
    .replace(/_t\.(jpg|png|webp)/gi, "_o.$1")
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

  const photoUrl = photoData?.url;
  if (photoUrl) {
    console.log(`[${adId}] ✓ Strategy 1 (photo_data.url): ${photoUrl.substring(0, 200)}`);
    return { thumbnail_url: photoUrl, video_url, ad_format, strategy: "photo_data", details: { photoUrl } };
  }

  const linkPicture = linkData?.picture;
  if (linkPicture) {
    const upgraded = upgradeFbResolution(linkPicture);
    console.log(`[${adId}] ✓ Strategy 2 (link_data.picture): ${upgraded?.substring(0, 200)}`);
    return { thumbnail_url: upgraded, video_url, ad_format, strategy: "link_data", details: { original: linkPicture, upgraded } };
  }

  const feedImage = creative?.asset_feed_spec?.images?.[0]?.url;
  if (feedImage) {
    console.log(`[${adId}] ✓ Strategy 3 (asset_feed_spec): ${feedImage.substring(0, 200)}`);
    return { thumbnail_url: feedImage, video_url, ad_format, strategy: "asset_feed", details: { feedImage } };
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

  if (creative?.thumbnail_url) {
    const upgraded = upgradeFbResolution(creative.thumbnail_url);
    console.log(`[${adId}] ⚠ Strategy 6 (thumbnail_url): ${upgraded?.substring(0, 200)}`);
    return { thumbnail_url: upgraded, video_url, ad_format, strategy: "thumbnail", details: { original: creative.thumbnail_url, upgraded } };
  }

  if (creative?.image_url) {
    const upgraded = upgradeFbResolution(creative.image_url);
    console.log(`[${adId}] ⚠⚠ Strategy 7 FALLBACK (image_url): ${upgraded?.substring(0, 200)}`);
    return { thumbnail_url: upgraded, video_url, ad_format, strategy: "image_url_fallback", details: { original: creative.image_url, upgraded } };
  }

  console.error(`[${adId}] ✗ All strategies failed`);
  return { thumbnail_url: null, video_url, ad_format, strategy: "none", details: { creative } };
}

async function persistThumbnail(metaUrl: string | null, adId: string, svc: any): Promise<string | null> {
  if (!metaUrl) return null;
  console.log(`[${adId}] Persisting image from: ${metaUrl.substring(0, 200)}`);
  try {
    const resp = await fetch(metaUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!resp.ok) {
      console.error(`[${adId}] Image fetch failed: ${resp.status} ${resp.statusText}`);
      return metaUrl;
    }
    const contentLength = resp.headers.get("content-length");
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();
    const byteLength = arrayBuffer.byteLength;
    console.log(`[${adId}] Image downloaded: ${contentLength ?? byteLength} bytes, type: ${contentType}, buffer: ${byteLength}`);

    if (byteLength < 5000) {
      console.warn(`[${adId}] REFUSING tiny image (${byteLength} bytes) — likely 64x64 thumbnail`);
      return metaUrl;
    }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const filename = `meta-ads/${adId}-${Date.now()}.${ext}`;
    const { error } = await svc.storage.from("referenz-showcase").upload(filename, new Uint8Array(arrayBuffer), {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) { console.error(`[${adId}] Upload error:`, error); return metaUrl; }
    const { data } = svc.storage.from("referenz-showcase").getPublicUrl(filename);
    console.log(`[${adId}] ✓ Persisted to: ${data?.publicUrl}`);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.error(`[${adId}] Persist failed:`, (e as Error).message);
    return metaUrl;
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

    const { adId, datePreset = "maximum", force = false } = await req.json().catch(() => ({}));

    let query = svc
      .from("referenz_meta_ads")
      .select("id, meta_ad_id, meta_account_id, meta_account_name, filter_values, custom_tags");
    if (adId) query = query.eq("id", adId);
    const { data: rows } = await query;
    if (!rows?.length) return new Response(JSON.stringify({ refreshed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const creativeFields = [
      "id", "name", "object_type",
      "image_url", "thumbnail_url", "image_hash",
      "video_id",
      "object_story_spec{video_data{video_id,image_url,image_hash},link_data{picture,image_hash,child_attachments{picture,image_hash}},photo_data{url,image_hash}}",
      "asset_feed_spec",
      "effective_object_story_id",
    ].join(",");

    let count = 0;
    for (const r of rows as any[]) {
      try {
        const adFields = [
          "id", "name", "account_id",
          `creative{${creativeFields}}`,
        ].join(",");
        const adData = await metaGet(`/${r.meta_ad_id}`, { fields: adFields });
        const creative = adData.creative ?? {};
        const accId = r.meta_account_id || `act_${adData.account_id}`;

        // Force-clear old persisted file so we always re-fetch
        if (force) {
          const { error: rmErr } = await svc.storage
            .from("referenz-showcase")
            .remove([`meta-ads/${r.meta_ad_id}.jpg`]);
          if (rmErr) console.warn("[force] remove failed:", rmErr.message);
          else console.log(`[force] removed meta-ads/${r.meta_ad_id}.jpg`);
        }

        const { thumbnail_url: rawThumb, video_url, ad_format, strategy, details } = await resolveCreativeUrls(creative, accId, r.meta_ad_id);
        const persistedThumb = await persistThumbnail(rawThumb, r.meta_ad_id, svc);

        const ins = await metaGet(`/${r.meta_ad_id}/insights`, {
          fields: "spend,impressions,clicks,ctr,cpm,actions,action_values,date_start,date_stop",
          date_preset: datePreset,
        });
        const row = ins?.data?.[0];
        const metrics = extractMetrics(row);

        // Re-run enrichment so branche, kunde-link, and auto-tags stay fresh
        const enrichment = await enrichAdData(
          svc,
          { meta_account_id: r.meta_account_id, meta_account_name: r.meta_account_name },
          {
            ...(r.filter_values ?? {}),
            ...(ad_format ? { format: ad_format } : {}),
          },
          r.custom_tags ?? [],
        );

        await svc.from("referenz_meta_ads").update({
          meta_metrics: metrics,
          campaign_period_start: row?.date_start ?? null,
          campaign_period_end: row?.date_stop ?? null,
          metrics_last_refreshed_at: new Date().toISOString(),
          ad_format,
          thumbnail_url: persistedThumb || rawThumb,
          thumbnail_url_meta: rawThumb,
          thumbnail_url_persisted: persistedThumb && persistedThumb !== rawThumb ? persistedThumb : null,
          sync_strategy: strategy,
          sync_details: {
            ...details,
            raw_url: rawThumb,
            persisted_url: persistedThumb && persistedThumb !== rawThumb ? persistedThumb : null,
            persisted_to_storage: !!persistedThumb && persistedThumb !== rawThumb,
            force,
          },
          last_sync_error: rawThumb ? (persistedThumb === rawThumb ? "Image not persisted to storage; using Meta URL fallback" : null) : "No image URL found",
          last_synced_at: new Date().toISOString(),
          video_url,
          filter_values: enrichment.filter_values,
          custom_tags: enrichment.custom_tags,
          linked_kunde_id: enrichment.linked_kunde_id,
        }).eq("id", r.id);
        count++;
      } catch (e) {
        console.error("refresh error", r.meta_ad_id, e);
        await svc.from("referenz_meta_ads").update({
          last_sync_error: (e as Error).message,
          last_synced_at: new Date().toISOString(),
        }).eq("id", r.id);
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
