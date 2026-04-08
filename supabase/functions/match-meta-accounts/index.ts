import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { adAccounts, deals } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const accountList = adAccounts.map((a: any) =>
      `"${a.account_id || a.id}": "${a.name}"`
    ).join('\n');

    const dealList = deals.map((d: any) =>
      `"${d.id}": "${d.client_name}${d.art ? ' · ' + d.art : ''}"`
    ).join('\n');

    const prompt = `You are matching Meta Ads account names to client records for a German insurance marketing agency.

Ad Accounts (account_id: name):
${accountList}

Clients (client_id: name):
${dealList}

Rules:
- Match by last name primarily — last names are the strongest signal
- Ignore these generic words when matching: PKV, BU, TKV, KV, Versicherung, Versicherungen, GmbH, UG, AG, Digital, Marketing, Recruiting, Beihilfe, Tierkrankenversicherung, Hanse, Merkur, Allianz, AXA, Signal, Iduna
- An account like "Henrik Johannsen Versicherungen" matches client "Henrik Johannsen · PKV" because "Johannsen" is the key word
- An account like "Alexander Lichtner Hanse Merkur" matches "Alexander Lichtner · PKV" 
- Only match if you are confident (>70%). Return null if unsure.
- Each client_id can be used multiple times (one client can have multiple ad accounts)

Respond ONLY with a JSON object mapping each account_id to a client_id or null. No markdown, no explanation:
{"account_id_1": "client_id_or_null", "account_id_2": "client_id_or_null"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-preview",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) throw new Error(`Gateway error: ${response.status}`);

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const mappings = JSON.parse(clean);

    return new Response(JSON.stringify({ mappings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
