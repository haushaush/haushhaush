// List importable Meta Campaigns (not yet in referenz_meta_campaigns)
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
  accountId: string;
  search?: string;
  status?: "ALL" | "ACTIVE" | "PAUSED" | "DELETED";
  limit?: number;
  after?: string;
  datePreset?: string;
}

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden – admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Body = await req.json();
    if (!body.accountId) throw new Error("accountId required");
    const accountId = body.accountId.startsWith("act_") ? body.accountId : `act_${body.accountId}`;
    const limit = Math.min(body.limit ?? 25, 50);
    const datePreset = body.datePreset ?? "maximum";

    const { data: existing } = await svc
      .from("referenz_meta_campaigns")
      .select("meta_campaign_id");
    const importedSet = new Set((existing ?? []).map((r: any) => r.meta_campaign_id));

    const params: Record<string, string> = {
      fields: "id,name,objective,status,effective_status,created_time,start_time,stop_time",
      limit: String(limit),
    };
    if (body.after) params.after = body.after;
    if (body.status && body.status !== "ALL") {
      params.filtering = JSON.stringify([
        { field: "effective_status", operator: "IN", value: [body.status] },
      ]);
    }

    const campRes = await metaGet(`/${accountId}/campaigns`, params);
    const campaigns: any[] = campRes.data ?? [];

    let accountName = "";
    try {
      const acc = await metaGet(`/${accountId}`, { fields: "name" });
      accountName = acc?.name ?? "";
    } catch { /* ignore */ }

    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        const alreadyImported = importedSet.has(c.id);
        let metrics: any = null;
        let date_start: string | null = null;
        let date_stop: string | null = null;
        if (!alreadyImported) {
          try {
            const ins = await metaGet(`/${c.id}/insights`, {
              fields: "spend,impressions,clicks,ctr,cpm,reach,frequency,actions,action_values,date_start,date_stop",
              date_preset: datePreset,
            });
            const row = ins?.data?.[0];
            metrics = extractMetrics(row);
            date_start = row?.date_start ?? null;
            date_stop = row?.date_stop ?? null;
          } catch { /* ignore */ }
        }
        return {
          meta_campaign_id: c.id,
          meta_campaign_name: c.name,
          meta_account_id: accountId,
          meta_account_name: accountName,
          meta_objective: c.objective ?? null,
          meta_status: c.effective_status ?? c.status ?? null,
          campaign_period_start: date_start ?? c.start_time?.split("T")[0] ?? null,
          campaign_period_end: date_stop ?? c.stop_time?.split("T")[0] ?? null,
          metrics,
          already_imported: alreadyImported,
        };
      })
    );

    return new Response(
      JSON.stringify({
        campaigns: enriched,
        paging: campRes.paging ?? null,
        account_name: accountName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("meta-campaigns-list-importable", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
