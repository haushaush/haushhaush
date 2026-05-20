import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCK_KEY = "reset_and_resync";
const LOCK_TTL_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) acquire lock (or release stale)
    const { data: existing } = await supabase
      .from("close_sync_locks").select("acquired_at").eq("lock_key", LOCK_KEY).maybeSingle();
    if (existing) {
      const ageMin = (Date.now() - new Date(existing.acquired_at).getTime()) / 60000;
      if (ageMin < LOCK_TTL_MIN) {
        return new Response(JSON.stringify({ error: "Reset/Sync läuft bereits" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("close_sync_locks").delete().eq("lock_key", LOCK_KEY);
    }
    await supabase.from("close_sync_locks").insert({ lock_key: LOCK_KEY, acquired_by: "reset-close-data" });

    // 2) count before
    const [leadsC, contactsC, oppsC, actsC, tasksC] = await Promise.all([
      supabase.from("close_leads").select("*", { count: "exact", head: true }),
      supabase.from("close_contacts").select("*", { count: "exact", head: true }),
      supabase.from("close_opportunities").select("*", { count: "exact", head: true }),
      supabase.from("close_activities").select("*", { count: "exact", head: true }),
      supabase.from("close_tasks").select("*", { count: "exact", head: true }),
    ]);
    const deleted = {
      leads: leadsC.count ?? 0,
      contacts: contactsC.count ?? 0,
      opps: oppsC.count ?? 0,
      activities: actsC.count ?? 0,
      tasks: tasksC.count ?? 0,
    };

    // 3) delete all rows (RLS service role bypasses)
    for (const t of ["close_leads", "close_contacts", "close_opportunities", "close_activities", "close_tasks"]) {
      const { error } = await supabase.from(t).delete().not("close_lead_id".startsWith("close_lead") ? "close_lead_id" : "id", "is", null);
      // safer: blanket delete via filter that always true
      if (error) {
        const { error: e2 } = await supabase.from(t).delete().gte("synced_at", "1900-01-01");
        if (e2) console.error(`[reset] ${t}: ${e2.message}`);
      }
    }

    // 4) clear last_synced_at on links
    const { count: linkedCount } = await supabase
      .from("close_link").select("*", { count: "exact", head: true });
    await supabase.from("close_link").update({ last_synced_at: null }).not("client_id", "is", null);

    // 5) release lock
    await supabase.from("close_sync_locks").delete().eq("lock_key", LOCK_KEY);

    const result = {
      deleted,
      linked_clients_count: linkedCount ?? 0,
      ready_for_resync: true,
      duration_ms: Date.now() - t0,
    };
    console.log("[Reset Close]", result);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    await supabase.from("close_sync_locks").delete().eq("lock_key", LOCK_KEY);
    console.error("[reset-close-data] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
