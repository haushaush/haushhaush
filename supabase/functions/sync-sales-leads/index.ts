import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cf, closeFetch, corsHeaders, loadCfMap, logStep, MAX_ITEMS, mem, PAGE, sleep, str } from "../_shared/closeSales.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const map = await loadCfMap(supabase, "lead");
    if (map.size === 0) console.warn("[sync-sales-leads] custom field map empty — run sync-sales-custom-fields first");

    let upserted = 0;
    const errors: string[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore && upserted < MAX_ITEMS) {
      await sleep(120);
      const data = await closeFetch(`/lead/?_limit=${PAGE}&_skip=${skip}`);
      const items: any[] = data.data || [];

      const rows = items.map((item) => ({
        id: item.id,
        name: item.display_name || item.name || null,
        status_id: str(item.status_id),
        status_label: str(item.status_label),
        kanal: str(cf(item, map, "Kanal")),
        marke: str(cf(item, map, "Marke")),
        branche: str(cf(item, map, "Branche")),
        sub_niche: str(cf(item, map, "Sub-Niche")),
        angle_ad_name: str(cf(item, map, "Angle / Ad Name")),
        website_vorhanden: str(cf(item, map, "Website vorhanden?")),
        disqualifikations_grund: str(cf(item, map, "Disqualifikations-Grund")),
        campaign_name: str(cf(item, map, "Campaign Name")),
        adset_name: str(cf(item, map, "Adset Name")),
        platform: str(cf(item, map, "Platform")),
        owner_id: str(item.created_by ?? item.owner_id),
        owner_name: str(item.created_by_name ?? item.owner_name),
        date_created: item.date_created || null,
        date_updated: item.date_updated || null,
        synced_at: new Date().toISOString(),
      }));

      if (rows.length) {
        const { error } = await supabase.from("sales_leads").upsert(rows, { onConflict: "id" });
        if (error) errors.push(error.message);
        else upserted += rows.length;
      }

      hasMore = items.length === PAGE;
      skip += PAGE;
      console.log(`[sales-leads] skip=${skip} upserted=${upserted} mem=${mem()}MB`);
    }

    const duration_ms = Date.now() - t0;
    await logStep(supabase, "leads", upserted, errors.length, duration_ms);
    return new Response(JSON.stringify({ success: true, upserted, errors: errors.length, duration_ms, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-sales-leads] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
