const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BATCH = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { client_ids } = await req.json();
    if (!Array.isArray(client_ids) || client_ids.length === 0) {
      throw new Error("client_ids[] required");
    }
    if (client_ids.length > MAX_BATCH) {
      return new Response(
        JSON.stringify({ error: `Bitte in Batches von ${MAX_BATCH} triggern (received ${client_ids.length}).` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-close-lead-full`;
    const auth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < client_ids.length; i++) {
      const id = client_ids[i];
      try {
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: id }),
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = text;
          try { msg = JSON.parse(text).error || text; } catch {}
          failed.push({ id, error: String(msg).slice(0, 200) });
          console.log(`[batch] ${id} FAIL: ${msg}`);
        } else {
          success.push(id);
          console.log(`[batch] ${id} OK (${i + 1}/${client_ids.length})`);
        }
      } catch (e: any) {
        failed.push({ id, error: e.message });
      }
      await sleep(800);
    }

    const summary = { success, failed, total: client_ids.length };
    console.log("[sync-close-batch]", { ok: success.length, failed: failed.length });
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
