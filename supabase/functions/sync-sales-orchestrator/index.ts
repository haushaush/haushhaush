import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, sleep } from "../_shared/closeSales.ts";

const STEPS = [
  "sync-sales-custom-fields",
  "sync-sales-leads",
  "sync-sales-opportunities",
  "sync-sales-calls",
  "sync-sales-status-changes",
];

async function callStep(name: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    return { name, ok: res.ok, status: res.status, duration_ms: Date.now() - t0, data };
  } catch (e: any) {
    return { name, ok: false, status: 0, duration_ms: Date.now() - t0, error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const results: any[] = [];
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const r = await callStep(step);
    console.log(`[sales-orchestrator] ${step} ->`, JSON.stringify(r).slice(0, 300));
    results.push(r);

    const d = r.data || {};
    const upserted =
      typeof d.upserted === "number"
        ? d.upserted
        : (d.opportunities?.upserted ?? 0) + (d.leads?.upserted ?? 0);
    const errors =
      typeof d.errors === "number"
        ? d.errors
        : (d.opportunities?.errors ?? 0) + (d.leads?.errors ?? 0);
    await supabase.from("sales_sync_log").insert({
      step: `orchestrator:${step}`,
      upserted: r.ok ? upserted : 0,
      errors: r.ok ? errors : 1,
      duration_ms: r.duration_ms,
    });

    if (i < STEPS.length - 1) await sleep(20_000);
  }

  const duration_ms = Date.now() - t0;
  await supabase.from("sales_sync_log").insert({
    step: "orchestrator:done",
    upserted: 0,
    errors: results.filter((r) => !r.ok).length,
    duration_ms,
  });

  return new Response(JSON.stringify({ success: true, duration_ms, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
