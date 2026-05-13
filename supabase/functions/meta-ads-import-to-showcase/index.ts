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
function upgradeFbResolution(url: string): string {
  if (!url) return url;

  let cleaned = url;

  // CRITICAL STEP 1: Entferne stp-Parameter (das macht Bild 64x64)
  // Match: &stp=... bis zum nächsten & oder Ende
  cleaned = cleaned.replace(/[?&]stp=[^&]+/g, (match) => {
    return match.startsWith('?') ? '?' : '';
  });

  // Aufräumen: doppelte ? oder & nach Removal
  cleaned = cleaned.replace(/\?&/, '?').replace(/&&+/g, '&').replace(/[?&]$/, '');

  // CRITICAL STEP 2: _n.jpg → _o.jpg (Original)
  cleaned = cleaned.replace(/_n\.jpg/g, '_o.jpg')
                   .replace(/_s\.jpg/g, '_o.jpg')
                   .replace(/_t\.jpg/g, '_o.jpg');

  // CRITICAL STEP 3: Path-basierte Resolution-Limiter
  cleaned = cleaned.replace(/\/p\d+x\d+\//g, '/')
                   .replace(/\/s\d+x\d+\//g, '/')
                   .replace(/\/c\d+\.\d+x\d+\.\d+\//g, '/');

  return cleaned;
}

const testUrl = "https://scontent.xx.fbcdn.net/v/t45.1600-4/file_n.jpg?_nc_cat=110&stp=c0.5000x0.5000f_dst-emg0_p64x64_q75_tt6&ur=52f3c4";
const result = upgradeFbResolution(testUrl);
console.log('UPGRADE TEST:');
console.log('  Input :', testUrl);
console.log('  Output:', result);
console.log('  stp removed:', !result.includes('stp='));
console.log('  _n→_o done:', result.includes('_o.jpg'));

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

async function resolveBestImageUrl(creative: any, accountId: string, token: string, adId: string) {
  const story = creative?.object_story_spec || {};
  const photoData = story.photo_data;
  const linkData = story.link_data;
  const videoData = story.video_data;
  const assetImages = creative?.asset_feed_spec?.images ?? [];
  const hash = creative?.image_hash
    || photoData?.image_hash
    || linkData?.image_hash
    || videoData?.image_hash
    || linkData?.child_attachments?.[0]?.image_hash
    || assetImages?.[0]?.hash
    || assetImages?.[0]?.image_hash
    || null;

  const debug: any = {
    creative_keys: Object.keys(creative || {}),
    image_hash: hash,
    direct_image_hash: creative?.image_hash || null,
    has_object_story_spec: !!creative?.object_story_spec,
    object_story_spec_keys: creative?.object_story_spec ? Object.keys(creative.object_story_spec) : [],
    has_asset_feed_spec: !!creative?.asset_feed_spec,
    asset_feed_image_count: Array.isArray(assetImages) ? assetImages.length : 0,
  };

  console.log(`[${adId}] Resolve debug:`, JSON.stringify(debug, null, 2));

  // STRATEGY 1
  if (photoData?.url) {
    const upgraded = upgradeFbResolution(photoData.url);
    console.log(`[${adId}] Strategy 1: photo_data.url\n  Before: ${photoData.url.substring(0, 200)}\n  After:  ${upgraded.substring(0, 200)}`);
    return { url: upgraded, strategy: 'photo_data', debug: { ...debug, original: photoData.url, upgraded } };
  } else {
    debug.photo_data_error = 'No object_story_spec.photo_data.url';
  }

  // STRATEGY 2
  if (linkData?.picture) {
    const upgraded = upgradeFbResolution(linkData.picture);
    console.log(`[${adId}] Strategy 2: link_data.picture\n  Before: ${linkData.picture.substring(0, 200)}\n  After:  ${upgraded.substring(0, 200)}`);
    return { url: upgraded, strategy: 'link_data', debug: { ...debug, original: linkData.picture, upgraded } };
  } else {
    debug.link_data_error = 'No object_story_spec.link_data.picture';
  }

  // STRATEGY 3
  if (assetImages?.[0]?.url) {
    const upgraded = upgradeFbResolution(assetImages[0].url);
    console.log(`[${adId}] Strategy 3: asset_feed\n  Before: ${assetImages[0].url.substring(0, 200)}\n  After:  ${upgraded.substring(0, 200)}`);
    return { url: upgraded, strategy: 'asset_feed', debug: { ...debug, original: assetImages[0].url, upgraded } };
  } else {
    debug.asset_feed_error = 'No asset_feed_spec.images[0].url';
  }

  // STRATEGY 4 — image_hash lookup (HIER NEU PRIORISIERT)
  if (hash) {
    console.log(`[${adId}] Strategy 4: Trying /adimages lookup with hash ${hash}`);

    try {
      const bareAccountId = accountId.replace(/^act_/, '');
      const lookupUrl = `https://graph.facebook.com/v19.0/act_${bareAccountId}/adimages?hashes=${encodeURIComponent(JSON.stringify([hash]))}&fields=url,permalink_url,original_width,original_height,width,height&access_token=${token}`;

      console.log(`[${adId}] Lookup URL: ${lookupUrl.substring(0, 200)}...`);

      const lookupRes = await fetch(lookupUrl);
      const lookupData = await lookupRes.json();

      console.log(`[${adId}] adimages response status: ${lookupRes.status}`);
      console.log(`[${adId}] adimages response body:`, JSON.stringify(lookupData, null, 2));

      if (lookupRes.ok) {
        // WICHTIG: Meta returnt images als Object mit hash als key, NICHT als array
        const imagesObj = lookupData?.images || {};
        const imageData = imagesObj[hash] || lookupData?.data?.[0];

        if (imageData) {
          const bestUrl = imageData.permalink_url || imageData.url;
          const upgraded = upgradeFbResolution(bestUrl);
          debug.adimages_dimensions = `${imageData.original_width || imageData.width}×${imageData.original_height || imageData.height}`;
          debug.adimages_permalink = imageData.permalink_url;
          debug.original = bestUrl;
          debug.upgraded = upgraded;
          debug.adimages_raw = imageData;
          console.log(`[${adId}] ✓ Strategy 4 SUCCESS: ${debug.adimages_dimensions}`);
          return { url: upgraded, strategy: 'adimages', debug };
        } else {
          console.warn(`[${adId}] adimages returned 200 but no imageData for hash ${hash}`);
          debug.adimages_error = `No imageData for hash ${hash}`;
        }
      } else {
        console.error(`[${adId}] adimages lookup failed: ${lookupRes.status}`, lookupData);
        debug.adimages_error = `HTTP ${lookupRes.status}: ${JSON.stringify(lookupData?.error || lookupData)}`;
      }
    } catch (e: any) {
      console.error(`[${adId}] adimages exception:`, e.message);
      debug.adimages_error = e.message;
    }
  } else {
    console.warn(`[${adId}] No image_hash available — skipping Strategy 4`);
    debug.adimages_error = 'No image_hash in creative';
  }

  // STRATEGY 5 — thumbnail (mit URL-Cleanup)
  if (creative?.thumbnail_url) {
    const upgraded = upgradeFbResolution(creative.thumbnail_url);
    console.log(`[${adId}] Strategy 5: thumbnail (after cleanup)\n  Before: ${creative.thumbnail_url.substring(0, 200)}\n  After:  ${upgraded.substring(0, 200)}`);
    return { url: upgraded, strategy: 'thumbnail', debug: { ...debug, original: creative.thumbnail_url, upgraded } };
  }

  // STRATEGY 6 — image_url (mit URL-Cleanup)
  if (creative?.image_url) {
    const upgraded = upgradeFbResolution(creative.image_url);
    console.log(`[${adId}] Strategy 6 FALLBACK: image_url (after cleanup)\n  Before: ${creative.image_url.substring(0, 200)}\n  After:  ${upgraded.substring(0, 200)}`);
    return { url: upgraded, strategy: 'image_url_fallback', debug: { ...debug, original: creative.image_url, upgraded } };
  }

  return { url: null, strategy: 'none', debug };
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
  const story = creative.object_story_spec || {};
  const videoData = story.video_data;
  const linkData = story.link_data;
  let video_url: string | null = null;
  let ad_format = "image";
  let videoId: string | null = null;

  if (creative.video_id || videoData?.video_id) {
    ad_format = "video";
    videoId = creative.video_id || videoData?.video_id;
  } else if (linkData?.child_attachments?.length > 0) {
    ad_format = "carousel";
  }

  const resolveResult = await resolveBestImageUrl(creative, accountId, ACCESS_TOKEN!, adId);
  if (!resolveResult.url && videoId) {
    const videoInfo = await fetchVideoInfo(videoId);
    video_url = videoInfo?.source || null;
    if (videoInfo?.largestThumbnail) {
      const upgraded = upgradeFbResolution(videoInfo.largestThumbnail);
      console.log(`[${adId}] Strategy video_thumbnail:\n  Before: ${videoInfo.largestThumbnail.substring(0, 200)}\n  After:  ${upgraded.substring(0, 200)}`);
      return { thumbnail_url: upgraded, video_url, ad_format, strategy: "video_thumbnail", details: { ...resolveResult.debug, videoId, original: videoInfo.largestThumbnail, upgraded } };
    }
  }

  return {
    thumbnail_url: resolveResult.url,
    video_url,
    ad_format,
    strategy: resolveResult.strategy,
    details: resolveResult.debug,
  };
}

async function persistImageToStorage(metaUrl: string | null, adId: string, supabase: any) {
  const result: any = {
    url: null,
    error: null,
    debug: {
      source_url: metaUrl?.substring(0, 200),
      bucket: 'referenz-showcase',
    }
  };

  // Schritt 0: URL valid?
  if (!metaUrl || !metaUrl.startsWith('http')) {
    result.error = 'Invalid source URL';
    return result;
  }

  try {
    // Schritt 1: Fetch from Meta
    console.log(`[${adId}] PERSIST: Fetching ${metaUrl.substring(0, 150)}...`);

    const imgRes = await fetch(metaUrl, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });

    result.debug.fetch_status = imgRes.status;
    result.debug.fetch_content_type = imgRes.headers.get('content-type');
    result.debug.fetch_content_length = imgRes.headers.get('content-length');

    if (!imgRes.ok) {
      result.error = `Meta CDN returned ${imgRes.status}`;
      return result;
    }

    // Schritt 2: Read body
    const buffer = await imgRes.arrayBuffer();
    const sizeKb = Math.round(buffer.byteLength / 1024);
    result.debug.actual_size_kb = sizeKb;

    console.log(`[${adId}] PERSIST: Got ${sizeKb}KB`);

    if (sizeKb < 2) {
      result.error = `Image too small: ${sizeKb}KB — likely empty or broken`;
      return result;
    }

    if (sizeKb < 10) {
      console.warn(`[${adId}] PERSIST: Suspiciously small (${sizeKb}KB) — but uploading anyway`);
    }

    // Schritt 3: Upload to Storage
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const filename = `meta-ads/${adId}-${Date.now()}.${ext}`;

    result.debug.target_filename = filename;

    console.log(`[${adId}] PERSIST: Uploading to ${filename}`);

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('referenz-showcase')
      .upload(filename, buffer, {
        contentType,
        cacheControl: '31536000',
        upsert: true,
      });

    result.debug.upload_data = uploadData;

    if (uploadErr) {
      console.error(`[${adId}] PERSIST: Upload error:`, JSON.stringify(uploadErr));
      result.error = `Upload error: ${uploadErr.message || JSON.stringify(uploadErr)}`;
      result.debug.upload_error_full = uploadErr;
      return result;
    }

    // Schritt 4: Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('referenz-showcase')
      .getPublicUrl(filename);

    if (!publicUrl) {
      result.error = 'getPublicUrl returned empty';
      return result;
    }

    result.url = publicUrl;
    result.debug.public_url = publicUrl;

    console.log(`[${adId}] PERSIST: ✓ Success → ${publicUrl}`);
    return result;

  } catch (e: any) {
    result.error = `Exception: ${e.message}`;
    result.debug.exception = e.message;
    result.debug.exception_stack = e.stack?.substring(0, 500);
    console.error(`[${adId}] PERSIST: Exception:`, e.message);
    return result;
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
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
        const { thumbnail_url: rawThumb, video_url, ad_format, strategy, details } = await resolveCreativeUrls(creative, accId, ad.id);

        const persistResult = await persistImageToStorage(rawThumb, ad.id, svc);
        const persistedThumb = persistResult.url;

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
          sync_strategy: strategy,
          sync_details: {
            ...details,
            raw_url: rawThumb,
            persisted_url: persistedThumb,
            persisted_to_storage: !!persistedThumb,
            persist_error: persistResult.error,
            persist_size_kb: persistResult.debug?.actual_size_kb ?? null,
            persist_debug: persistResult.debug,
          },
          last_sync_error: persistResult.error ?? (rawThumb ? null : "No image URL found"),
          last_synced_at: new Date().toISOString(),
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
