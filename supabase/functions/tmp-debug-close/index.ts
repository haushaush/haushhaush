const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { lead_id } = await req.json();
  const key = Deno.env.get("CLOSE_API_KEY_SALES")!;
  const res = await fetch(`https://api.close.com/api/v1/activity/?lead_id=${lead_id}&_limit=50`, {
    headers: { Authorization: `Basic ${btoa(`${key}:`)}`, Accept: "application/json" },
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
