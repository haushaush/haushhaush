import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const MAX_CLIENTS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
  const res = await fetch(`${CLOSE_BASE}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 429) {
    if (attempt > 3) throw new Error("Rate limited");
    await sleep(1000 * attempt);
    return closeFetch(path, attempt + 1);
  }
  if (res.status === 401) throw new Error("API key invalid");
  if (!res.ok) throw new Error(`Close ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let body: any = {};
    try { body = await req.json(); } catch {}
    const requestedIds: string[] | undefined = Array.isArray(body?.client_ids) ? body.client_ids : undefined;

    const { data: existingLinks } = await supabase.from("close_link").select("client_id");
    const linked = new Set((existingLinks || []).map((l: any) => l.client_id));

    let query = supabase.from("clients").select("id, name, email").not("email", "is", null);
    if (requestedIds?.length) query = query.in("id", requestedIds);
    const { data: clients, error } = await query;
    if (error) throw error;

    const targets = (clients || []).filter((c: any) => !linked.has(c.id) && !!c.email).slice(0, MAX_CLIENTS);
    const overflow = (clients || []).filter((c: any) => !linked.has(c.id) && !!c.email).length > MAX_CLIENTS;

    let processed = 0, matched = 0, unmatched = 0, ambiguous = 0;
    const errors: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i] as any;
      processed++;
      try {
        const q = encodeURIComponent(`email:"${c.email}"`);
        const data = await closeFetch(`/lead/?query=${q}&_limit=2&_fields=id`);
        const leads: any[] = data.data || [];
        if (leads.length === 1) {
          const { error: insErr } = await supabase.from("close_link").insert({
            client_id: c.id,
            close_lead_id: leads[0].id,
            matched_via: "email",
            match_confidence: 1.0,
          });
          if (insErr && !String(insErr.message).includes("duplicate")) errors.push(`${c.name}: ${insErr.message}`);
          else matched++;
        } else if (leads.length === 0) {
          unmatched++;
          console.log(`[unmatched] ${c.name} <${c.email}>`);
        } else {
          ambiguous++;
          console.log(`[ambiguous] ${c.name} <${c.email}> -> ${leads.length}`);
        }
      } catch (e: any) {
        errors.push(`${c.name}: ${e.message}`);
      }
      if (i % 10 === 9) console.log(`[match] ${i + 1}/${targets.length}, mem ${mem()}MB`);
      await sleep(500);
    }

    const summary = { processed, matched, unmatched, ambiguous, errors: errors.length, overflow, duration_ms: Date.now() - t0, mem_mb: mem() };
    console.log("[sync-close-link]", summary);
    return new Response(JSON.stringify({ success: true, ...summary, error_samples: errors.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[sync-close-link] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
