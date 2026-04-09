import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { org_slug, api_key } = await req.json();
    if (!org_slug || !api_key) throw new Error("org_slug and api_key required");

    const auth = btoa(`${org_slug}:${api_key}`);
    const res = await fetch(`https://thirdparty.qonto.com/v2/organizations/${org_slug}`, {
      headers: { 
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Qonto API error");

    const account = data.organization?.bank_accounts?.[0];
    const info = {
      balance: (account?.balance_cents || 0) / 100,
      iban: account?.iban || null,
      currency: account?.currency || "EUR",
      org_name: data.organization?.legal_name || data.organization?.slug,
      accounts: (data.organization?.bank_accounts || []).map((a: any) => ({
        name: a.name,
        iban: a.iban,
        balance: (a.balance_cents || 0) / 100,
        currency: a.currency,
      })),
    };

    return new Response(JSON.stringify({ info }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
