const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { path, account = "sales" } = await req.json();
  const key = Deno.env.get(account === "sales" ? "CLOSE_API_KEY_SALES" : "CLOSE_API_KEY")!;
  const res = await fetch(`https://api.close.com/api/v1${path}`, {
    headers: { Authorization: `Basic ${btoa(`${key}:`)}`, Accept: "application/json" },
  });
  const text = await res.text();
  return new Response(text, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Up": String(res.status) },
  });
});
