import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const MAX_CLIENTS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

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

    let query = supabase.from("clients").select("id, name, email");
    if (requestedIds?.length) query = query.in("id", requestedIds);
    const { data: clients, error } = await query;
    if (error) throw error;

    const candidates = (clients || []).filter((c: any) => !linked.has(c.id) && (c.email || c.name));
    const targets = candidates.slice(0, MAX_CLIENTS);
    const remaining_ids = candidates.slice(MAX_CLIENTS).map((c: any) => c.id);

    let processed = 0, email_matched = 0, name_fallback_exact = 0, name_fuzzy = 0, ambiguous = 0, no_match = 0;
    const errors: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i] as any;
      processed++;
      let linkedNow = false;

      try {
        // STEP 1 — EMAIL MATCH
        if (c.email) {
          const q = encodeURIComponent(`email:"${c.email}"`);
          const data = await closeFetch(`/lead/?query=${q}&_limit=2&_fields=id,display_name`);
          const leads: any[] = data.data || [];
          if (leads.length === 1) {
            const { error: insErr } = await supabase.from("close_link").insert({
              client_id: c.id,
              close_lead_id: leads[0].id,
              matched_via: "email",
              match_confidence: 1.0,
            });
            if (insErr && !String(insErr.message).includes("duplicate")) {
              errors.push(`${c.name}: ${insErr.message}`);
            } else {
              email_matched++;
              linkedNow = true;
            }
          }
          await sleep(250);
        }

        // STEP 2 — NAME FALLBACK
        if (!linkedNow && c.name) {
          const normalized = normalizeName(c.name);
          const q = encodeURIComponent(`display_name:"${normalized}"`);
          const data = await closeFetch(`/lead/?query=${q}&_limit=5&_fields=id,display_name`);
          const leads: any[] = data.data || [];

          if (leads.length === 1) {
            const leadName = normalizeName(leads[0].display_name || "");
            if (leadName === normalized) {
              const { error: insErr } = await supabase.from("close_link").insert({
                client_id: c.id,
                close_lead_id: leads[0].id,
                matched_via: "name_fallback",
                match_confidence: 0.9,
              });
              if (insErr && !String(insErr.message).includes("duplicate")) {
                errors.push(`${c.name}: ${insErr.message}`);
              } else {
                name_fallback_exact++;
              }
            } else {
              const sim = similarity(normalized, leadName);
              if (sim >= 0.7) {
                const { error: insErr } = await supabase.from("close_link").insert({
                  client_id: c.id,
                  close_lead_id: leads[0].id,
                  matched_via: "name_fuzzy",
                  match_confidence: Number(sim.toFixed(2)),
                });
                if (insErr && !String(insErr.message).includes("duplicate")) {
                  errors.push(`${c.name}: ${insErr.message}`);
                } else {
                  name_fuzzy++;
                  console.log(`[name_fuzzy] ${c.name} -> ${leads[0].display_name} (sim=${sim.toFixed(2)})`);
                }
              } else {
                no_match++;
                console.log(`[no_match] ${c.name}, ${c.email || "no-email"} (best sim=${sim.toFixed(2)})`);
              }
            }
          } else if (leads.length === 0) {
            no_match++;
            console.log(`[no_match] ${c.name}, ${c.email || "no-email"}`);
          } else {
            ambiguous++;
            const names = leads.map((l) => l.display_name).slice(0, 5);
            console.log(`[ambiguous_name] ${c.name}, candidates:`, names);
          }
          await sleep(250);
        }
      } catch (e: any) {
        errors.push(`${c.name}: ${e.message}`);
      }

      if (i % 10 === 9) console.log(`[link] ${i + 1}/${targets.length}, mem ${mem()}MB`);
    }

    const summary = {
      processed,
      email_matched,
      name_fallback_exact,
      name_fuzzy,
      ambiguous,
      no_match,
      remaining: remaining_ids.length,
      errors: errors.length,
      duration_ms: Date.now() - t0,
      mem_mb: mem(),
    };
    console.log("[Sync Link Summary]", summary);
    return new Response(JSON.stringify({ success: true, ...summary, remaining_ids, error_samples: errors.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[sync-close-link] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
