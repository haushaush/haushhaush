import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) get close_lead_id
    const { data: link, error: linkErr } = await supabase
      .from("close_link").select("close_lead_id").eq("client_id", client_id).maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) {
      return new Response(JSON.stringify({ error: "Kein Link für diesen Kunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const leadId = link.close_lead_id;

    // 2) delete per lead from all 5 tables
    const deleted: Record<string, number> = {};
    for (const t of ["close_leads", "close_contacts", "close_opportunities", "close_activities", "close_tasks"]) {
      const col = t === "close_leads" ? "close_lead_id" : "close_lead_id";
      const { error, count } = await supabase.from(t).delete({ count: "exact" }).eq(col, leadId);
      if (error) console.error(`[reset-single] ${t}: ${error.message}`);
      deleted[t] = count ?? 0;
    }

    // 3) clear last_synced_at
    await supabase.from("close_link").update({ last_synced_at: null }).eq("client_id", client_id);

    // 4) trigger re-sync
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-close-lead-full`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_id }),
    });
    const text = await res.text();
    let sync_result: any;
    try { sync_result = JSON.parse(text); } catch { sync_result = text; }

    const result = {
      deleted_counts: deleted,
      sync_ok: res.ok,
      sync_result,
      duration_ms: Date.now() - t0,
    };
    console.log("[Reset Single]", { client_id, leadId, deleted, ok: res.ok });
    return new Response(JSON.stringify(result), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[reset-close-data-single] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
