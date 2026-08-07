import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { arr, cf, closeFetch, corsHeaders, dateOnly, int, loadCfMap, logStep, MAX_ITEMS, mem, num, PAGE, sleep, str } from "../_shared/closeSales.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const map = await loadCfMap(supabase, "opportunity");
    if (map.size === 0) console.warn("[sync-sales-opportunities] custom field map empty — run sync-sales-custom-fields first");

    let upserted = 0;
    const errors: string[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore && upserted < MAX_ITEMS) {
      await sleep(120);
      const data = await closeFetch(`/opportunity/?_limit=${PAGE}&_skip=${skip}`);
      const items: any[] = data.data || [];

      const rows = items.map((item) => {
        // Close returns `value` already in cents for opportunities.
        const valueCents = typeof item.value === "number" ? Math.round(item.value)
          : item.value != null ? Math.round(Number(item.value)) : null;
        return {
          id: item.id,
          lead_id: str(item.lead_id),
          lead_name: str(item.lead_name),
          status_id: str(item.status_id),
          status_label: str(item.status_label),
          status_type: str(item.status_type),
          pipeline_id: str(item.pipeline_id),
          pipeline_name: str(item.pipeline_name),
          value_cents: Number.isFinite(valueCents as number) ? valueCents : null,
          value_currency: str(item.value_currency),
          leistungen: arr(cf(item, map, "Leistungen")),
          deal_typ: str(cf(item, map, "Deal-Typ")),
          setup_fee: num(cf(item, map, "Setup-Fee")),
          retainer_monat: num(cf(item, map, "Retainer pro Monat")),
          laufzeit: int(cf(item, map, "Laufzeit")),
          close_typ: str(cf(item, map, "Close-Typ")),
          cold_caller_id: str(cf(item, map, "Cold Caller")),
          setter_id: str(cf(item, map, "Setter")),
          closer_id: str(cf(item, map, "Closer")),
          live_datum: dateOnly(cf(item, map, "Startdatum")),
          churn_datum: dateOnly(cf(item, map, "Churn-Datum")),
          churn_grund: str(cf(item, map, "Churn-Grund")),
          rechnungs_id: str(cf(item, map, "Rechnungs-ID")),
          note: str(item.note),
          user_id: str(item.user_id),
          user_name: str(item.user_name),
          date_won: item.date_won || null,
          date_lost: item.date_lost || null,
          date_created: item.date_created || null,
          date_updated: item.date_updated || null,
          synced_at: new Date().toISOString(),
        };
      });

      if (rows.length) {
        const { error } = await supabase.from("sales_opportunities").upsert(rows, { onConflict: "id" });
        if (error) errors.push(error.message);
        else upserted += rows.length;
      }

      hasMore = items.length === PAGE;
      skip += PAGE;
      console.log(`[sales-opps] skip=${skip} upserted=${upserted} mem=${mem()}MB`);
    }

    const duration_ms = Date.now() - t0;
    await logStep(supabase, "opportunities", upserted, errors.length, duration_ms);
    return new Response(JSON.stringify({ success: true, upserted, errors: errors.length, duration_ms, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-sales-opportunities] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
