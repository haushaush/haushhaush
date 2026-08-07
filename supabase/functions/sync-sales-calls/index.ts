import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { closeFetch, corsHeaders, logStep, MAX_ITEMS, mem, PAGE, sleep, str } from "../_shared/closeSales.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let upserted = 0;
    const errors: string[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore && upserted < MAX_ITEMS) {
      await sleep(120);
      const data = await closeFetch(`/activity/call/?_limit=${PAGE}&_skip=${skip}`);
      const items: any[] = data.data || [];

      const rows = items.map((item) => ({
        id: item.id,
        lead_id: str(item.lead_id),
        user_id: str(item.user_id),
        user_name: str(item.user_name),
        direction: str(item.direction),
        duration: typeof item.duration === "number" ? Math.round(item.duration) : null,
        outcome_id: str(item.disposition_id ?? item.outcome_id),
        outcome_label: str(item.disposition ?? item.outcome_label ?? item.status),
        date_created: item.date_created || null,
        synced_at: new Date().toISOString(),
      }));

      if (rows.length) {
        const { error } = await supabase.from("sales_calls").upsert(rows, { onConflict: "id" });
        if (error) errors.push(error.message);
        else upserted += rows.length;
      }

      hasMore = items.length === PAGE;
      skip += PAGE;
      console.log(`[sales-calls] skip=${skip} upserted=${upserted} mem=${mem()}MB`);
    }

    const duration_ms = Date.now() - t0;
    await logStep(supabase, "calls", upserted, errors.length, duration_ms);
    return new Response(JSON.stringify({ success: true, upserted, errors: errors.length, duration_ms, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-sales-calls] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
