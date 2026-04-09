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

    // Qonto uses "login:secret-key" format — login is the org_slug (Kennung)
    // secret is the Geheimschlüssel (not the full API key string)
    const res = await fetch(`https://thirdparty.qonto.com/v2/organizations/${org_slug}`, {
      headers: {
        "Authorization": `${org_slug}:${api_key}`,
        "Accept": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      // Qonto returns { errors: [{ code, detail }] }
      const errDetail = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || data?.message || `HTTP ${res.status}`;
      throw new Error(errDetail);
    }

    const accounts = data.organization?.bank_accounts || [];
    const primary = accounts[0];

    const info = {
      org_name: data.organization?.legal_name || data.organization?.slug,
      balance: (primary?.balance_cents || 0) / 100,
      iban: primary?.iban || null,
      currency: primary?.currency || "EUR",
      accounts: accounts.map((a: any) => ({
        name: a.name,
        iban: a.iban,
        balance: (a.balance_cents || 0) / 100,
        currency: a.currency,
        status: a.status,
      })),
    };

    return new Response(JSON.stringify({ info }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).replace("Error: ", "") }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
