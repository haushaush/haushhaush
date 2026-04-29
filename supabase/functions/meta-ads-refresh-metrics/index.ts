// Refresh meta_metrics + creative URLs for one or all imported ads
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
): Promise<{ thumbnail_url: string | null; video_url: string | null; ad_format: string }> {
  if (!creative) return { thumbnail_url: null, video_url: null, ad_format: "image" };

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

  if (imageHash) {
    thumbnail_url = await resolveHighResUrl(imageHash, accountId);
    console.log(`[resolveCreativeUrls] hash=${imageHash} resolved=${thumbnail_url ? "YES" : "NO"}`);
  }

  if (videoId) {
    const videoInfo = await fetchVideoInfo(videoId);
    video_url = videoInfo?.source || null;
    if (!thumbnail_url && videoInfo?.largestThumbnail) {
      thumbnail_url = videoInfo.largestThumbnail;
    }
  }

  if (!thumbnail_url) {
    thumbnail_url = creative.image_url || linkData?.picture || null;
  }

  if (!thumbnail_url) {
    console.warn("[resolveCreativeUrls] FALLING BACK to thumbnail_url (64x64)");
    thumbnail_url = creative.thumbnail_url || null;
  }

  return { thumbnail_url, video_url, ad_format };
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
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { adId, datePreset = "maximum", force = false } = await req.json().catch(() => ({}));

    let query = svc.from("referenz_meta_ads").select("id, meta_ad_id, meta_account_id");
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

        const { thumbnail_url: rawThumb, video_url, ad_format } = await resolveCreativeUrls(creative, accId);
        const persistedThumb = await persistThumbnail(rawThumb, r.meta_ad_id, svc);

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
          ad_format,
          thumbnail_url: persistedThumb || rawThumb,
          thumbnail_url_meta: rawThumb,
          thumbnail_url_persisted: persistedThumb,
          video_url,
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
