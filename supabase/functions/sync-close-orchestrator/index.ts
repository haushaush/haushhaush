import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callStep(name: string, body: unknown) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
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

  let clientId: string | null = null;
  try { const b = await req.json(); if (b?.client_id) clientId = String(b.client_id); } catch {}

  // Early-exit: if client_id provided and synced < 4h ago, skip
  if (clientId) {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: link } = await supabase.from("close_link").select("last_synced_at").eq("client_id", clientId).maybeSingle();
    if (link?.last_synced_at && Date.now() - new Date(link.last_synced_at).getTime() < 4 * 60 * 60 * 1000) {
      console.log(`[orchestrator] skip client ${clientId} (fresh)`);
      return new Response(JSON.stringify({ success: true, skipped: "fresh" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const results = [];
  for (const step of ["sync-close-match-leads", "sync-close-opportunities", "sync-close-activities"]) {
    const body = step === "sync-close-match-leads" && clientId ? { client_id: clientId } : {};
    const r = await callStep(step, body);
    console.log(`[orchestrator] ${step} ->`, r);
    results.push(r);
    if (step !== "sync-close-activities") await sleep(30_000);
  }

  // Touch last_synced_at on close_link rows
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (clientId) {
    await supabase.from("close_link").update({ last_synced_at: new Date().toISOString() }).eq("client_id", clientId);
  } else {
    await supabase.from("close_link").update({ last_synced_at: new Date().toISOString() }).not("id", "is", null);
  }

  return new Response(JSON.stringify({ success: true, duration_ms: Date.now() - t0, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
