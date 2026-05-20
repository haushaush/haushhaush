// Batch wrapper: runs search-close-suggestions sequentially for multiple clients.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.client_ids) ? body.client_ids : [];
    if (!ids.length) {
      return new Response(JSON.stringify({ results: [], remaining_ids: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targets = ids.slice(0, MAX);
    const remaining_ids = ids.slice(MAX);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? `Bearer ${serviceKey}`;

    const results: any[] = [];
    for (let i = 0; i < targets.length; i++) {
      const id = targets[i];
      try {
        const res = await fetch(`${supaUrl}/functions/v1/search-close-suggestions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: authHeader,
          },
          body: JSON.stringify({ client_id: id }),
        });
        const data = await res.json();
        results.push({ client_id: id, ...data });
      } catch (e: any) {
        results.push({ client_id: id, error: e.message, suggestions: [] });
      }
      if (i < targets.length - 1) await sleep(500);
    }

    return new Response(JSON.stringify({ results, remaining_ids }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
