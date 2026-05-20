import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const BATCH_SIZE = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
  const url = path.startsWith("http") ? path : `${CLOSE_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
  if (res.status === 429) {
    if (attempt > 3) throw new Error("Rate limited");
    await sleep(800 * attempt);
    return closeFetch(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Close ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let clientId: string | null = null;
    try { const b = await req.json(); if (b?.client_id) clientId = String(b.client_id); } catch {}

    const { data: links } = await supabase.from("close_link").select("client_id");
    const linked = new Set((links || []).map((l) => l.client_id));

    let q = supabase.from("clients").select("id, name, email").not("email", "is", null).limit(BATCH_SIZE * 4);
    if (clientId) q = supabase.from("clients").select("id, name, email").eq("id", clientId);
    const { data: clients, error } = await q;
    if (error) throw error;

    const todo = (clients || []).filter((c) => !linked.has(c.id)).slice(0, BATCH_SIZE);
    let matched = 0, unmatched = 0, ambiguous = 0;
    const errors: string[] = [];

    for (let i = 0; i < todo.length; i++) {
      const c = todo[i];
      try {
        await sleep(80);
        const result = await closeFetch(`/lead/?query=${encodeURIComponent(`email:"${c.email}"`)}&_limit=2`);
        const leads = result.data || [];
        if (leads.length === 1) {
          const { error: ie } = await supabase.from("close_link").insert({
            client_id: c.id, close_lead_id: leads[0].id, matched_via: "email",
            match_confidence: 1.0, last_synced_at: new Date().toISOString(),
          });
          if (ie && ie.code !== "23505") errors.push(`${c.name}: ${ie.message}`);
          else matched++;
        } else if (leads.length === 0) unmatched++;
        else ambiguous++;
      } catch (e: any) {
        errors.push(`${c.name}: ${e.message}`);
      }
      if (i % 10 === 0) console.log(`[step:match] ${i}/${todo.length}, mem ${mem()}MB`);
    }

    const summary = { processed: todo.length, matched, unmatched, ambiguous, errors: errors.length, duration_ms: Date.now() - t0, mem_mb: mem() };
    console.log("[sync-close-match-leads]", summary);
    return new Response(JSON.stringify({ success: true, ...summary, error_samples: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-close-match-leads] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
