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

    const accountList = adAccounts.map((a: any, i: number) =>
      `${i}: "${a.name}" (ID: ${a.account_id || a.id})`
    ).join('\n');

    const dealList = deals.map((d: any) =>
      `"${d.id}": "${d.client_name}${d.art ? ' · ' + d.art : ''}"`
    ).join('\n');

    const prompt = `You are matching Meta Ads ad account names to client records for a German insurance marketing agency.

Ad Accounts (index: name):
${accountList}

Client records (id: name):
${dealList}

Task: For each ad account, find the best matching client record based on name similarity. Consider:
- Last names are the strongest signal
- Ignore generic words: PKV, BU, TKV, Versicherung, GmbH, UG, Digital, Marketing, Recruiting
- One ad account can be matched to one client only if confident (>70% sure)
- If unsure, return null for that account

Respond ONLY with a valid JSON object mapping account index (as string) to deal id or null:
{"0": "deal-uuid-here", "1": null, "2": "deal-uuid-here", ...}

No explanation, no markdown, just the JSON object.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht, bitte später erneut versuchen." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Credits aufgebraucht. Bitte Credits aufladen." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${err}`);
    }

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
