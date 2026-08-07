import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { closeFetch, corsHeaders, logStep, sleep } from "../_shared/closeSales.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let upserted = 0;
    const errors: string[] = [];

    for (const objectType of ["lead", "opportunity"]) {
      let skip = 0;
      let hasMore = true;
      while (hasMore) {
        await sleep(120);
        const data = await closeFetch(`/custom_field/${objectType}/?_limit=100&_skip=${skip}`);
        const items: any[] = data.data || [];
        const rows = items.map((f) => ({
          cf_id: f.id,
          object_type: objectType,
          name: f.name || null,
          field_type: f.type || null,
          synced_at: new Date().toISOString(),
        }));
        if (rows.length) {
          const { error } = await supabase.from("sales_custom_field_map").upsert(rows, { onConflict: "cf_id" });
          if (error) errors.push(`${objectType}: ${error.message}`);
          else upserted += rows.length;
        }
        hasMore = items.length === 100;
        skip += 100;
        console.log(`[cf:${objectType}] skip=${skip} upserted=${upserted}`);
      }
    }

    const duration_ms = Date.now() - t0;
    await logStep(supabase, "custom-fields", upserted, errors.length, duration_ms);
    return new Response(JSON.stringify({ success: true, upserted, errors: errors.length, duration_ms, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-sales-custom-fields] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
