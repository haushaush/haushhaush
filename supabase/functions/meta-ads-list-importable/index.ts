// List importable Meta Ads (not yet in referenz_meta_ads)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const API_VERSION = "v19.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

interface Body {
  accountId: string; // act_xxx OR raw id
  search?: string;
  status?: "ALL" | "ACTIVE" | "PAUSED" | "DELETED";
  limit?: number;
  after?: string;
  datePreset?: string; // last_7d, last_30d, maximum, ...
}

function authClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
}

function svcClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function isRateLimit(msg: string) {
  return /user request limit|rate limit|\(#17\)|\(#4\)|\(#32\)|\(#613\)/i.test(msg);
}

async function metaGet(path: string, params: Record<string, string> = {}, retries = 2) {
  const url = new URL(`${BASE}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("access_token", ACCESS_TOKEN!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let lastErr = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (res.ok) return data;
    lastErr = data?.error?.message || `Meta API ${res.status}`;
    if (!isRateLimit(lastErr) || attempt === retries) throw new Error(lastErr);
    await new Promise((r) => setTimeout(r, [3000, 8000][attempt] ?? 8000));
  }
  throw new Error(lastErr);
}

function isRateLimitErr(e: unknown) {
  return isRateLimit((e as Error)?.message ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    const supabase = authClient(req);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;
    const svc = svcClient();
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden – admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Body = await req.json();
    if (!body.accountId) throw new Error("accountId required");
    const accountId = body.accountId.startsWith("act_") ? body.accountId : `act_${body.accountId}`;
    const limit = Math.min(body.limit ?? 25, 50);
    const datePreset = body.datePreset ?? "last_30d";

    // Existing imported IDs
    const { data: existing } = await svc
      .from("referenz_meta_ads")
      .select("meta_ad_id");
    const importedSet = new Set((existing ?? []).map((r: any) => r.meta_ad_id));

    // Fetch ads
    const fields = [
      "id",
      "name",
      "status",
      "effective_status",
      "campaign_id",
      "campaign{name}",
      "adset_id",
      "adset{name}",
      "creative{id,thumbnail_url,image_url,video_id,object_story_spec,effective_object_story_id}",
      "account_id",
    ].join(",");

    const params: Record<string, string> = {
      fields,
      limit: String(limit),
    };
    if (body.after) params.after = body.after;
    if (body.status && body.status !== "ALL") {
      params.filtering = JSON.stringify([
        { field: "effective_status", operator: "IN", value: [body.status] },
      ]);
    }

    const adsRes = await metaGet(`/${accountId}/ads`, params);
    const ads: any[] = adsRes.data ?? [];

    // Account name (cache once)
    let accountName = "";
    try {
      const acc = await metaGet(`/${accountId}`, { fields: "name" });
      accountName = acc?.name ?? "";
    } catch { /* ignore */ }

    // Single account-level insights call with level=ad — avoids per-ad rate limits
    const insightsByAd = new Map<string, any>();
    if (ads.length > 0) {
      try {
        let after: string | undefined;
        let safety = 0;
        do {
          const insParams: Record<string, string> = {
            level: "ad",
            fields: "ad_id,spend,impressions,clicks,ctr,cpm,actions,action_values",
            date_preset: datePreset,
            limit: "500",
          };
          if (after) insParams.after = after;
          const insRes = await metaGet(`/${accountId}/insights`, insParams);
          for (const row of (insRes?.data ?? [])) {
            if (row.ad_id) insightsByAd.set(row.ad_id, row);
          }
          after = insRes?.paging?.cursors?.after && insRes?.paging?.next ? insRes.paging.cursors.after : undefined;
          safety++;
        } while (after && safety < 10);
      } catch (e) {
        console.warn("account-level insights failed:", (e as Error).message);
      }
    }

    const enriched: any[] = [];
    for (const ad of ads) {
      const alreadyImported = importedSet.has(ad.id);
      let metrics: any = null;
      const row = insightsByAd.get(ad.id);
      if (!alreadyImported && row) {
        const leadAction = (row.actions ?? []).find((a: any) =>
          ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"].includes(a.action_type)
        );
        const purchaseValue = (row.action_values ?? []).find((a: any) =>
          ["purchase", "offsite_conversion.fb_pixel_purchase"].includes(a.action_type)
        );
        const leads = leadAction ? Number(leadAction.value) : 0;
        const spend = Number(row.spend ?? 0);
        metrics = {
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
      const creative = ad.creative ?? {};
      const thumbnail = creative.thumbnail_url || creative.image_url || null;
      const adFormat = creative.video_id ? "video" : "image";
      enriched.push({
        meta_ad_id: ad.id,
        meta_ad_name: ad.name,
        meta_account_id: accountId,
        meta_account_name: accountName,
        meta_campaign_id: ad.campaign_id,
        meta_campaign_name: ad.campaign?.name,
        meta_adset_id: ad.adset_id,
        meta_adset_name: ad.adset?.name,
        meta_creative_id: creative.id,
        status: ad.effective_status ?? ad.status,
        ad_format: adFormat,
        thumbnail_url: thumbnail,
        metrics,
        already_imported: alreadyImported,
      });
    }

    return new Response(
      JSON.stringify({
        ads: enriched,
        paging: adsRes.paging ?? null,
        account_name: accountName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("meta-ads-list-importable", err);
    const msg = (err as Error).message;
    const rl = isRateLimitErr(err);
    return new Response(JSON.stringify({
      error: rl
        ? "Meta API Rate-Limit erreicht. Bitte 5–10 Minuten warten und erneut versuchen."
        : msg,
      rate_limited: rl,
    }), {
      status: rl ? 429 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
