import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { errorType, errorCode, errorMessage, errorStack, pageUrl, userAgent } = await req.json();

    const systemPrompt = `Du bist ein Frontend-Debugging-Assistent für eine React + Supabase App (Agency Hub Dashboard).
Die App ist mit Lovable gebaut. Antworte NUR im folgenden JSON-Format:
{
  "diagnosis": "Kurze Erklärung was der Fehler bedeutet (max 2 Sätze, auf Deutsch)",
  "likely_cause": "Wahrscheinlichste Ursache (1 Satz)",
  "auto_fixes": [
    { "label": "Fix-Name", "action": "localStorage_clear | session_reload | cache_clear | state_reset | auth_retry", "description": "Was dieser Fix macht" }
  ],
  "manual_steps": ["Schritt 1", "Schritt 2"],
  "severity": "low | medium | high"
}
Schlage maximal 3 auto_fixes vor die tatsächlich runtime-seitig ausführbar sind.
Gültige actions: localStorage_clear, session_reload, cache_clear, state_reset, auth_retry.`;

    const userPrompt = `Fehler in Agency Hub Dashboard:
Fehlertyp: ${errorType || "unknown"}
Fehlercode: ${errorCode || "unknown"}
Fehlermeldung: ${errorMessage || "keine"}
Stack: ${(errorStack || "").slice(0, 500)}
Seite: ${pageUrl || "unknown"}
Browser: ${userAgent || "unknown"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "diagnose_error",
              description: "Return structured error diagnosis",
              parameters: {
                type: "object",
                properties: {
                  diagnosis: { type: "string", description: "Short explanation of the error in German" },
                  likely_cause: { type: "string", description: "Most likely cause in German" },
                  auto_fixes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        action: { type: "string", enum: ["localStorage_clear", "session_reload", "cache_clear", "state_reset", "auth_retry"] },
                        description: { type: "string" },
                      },
                      required: ["label", "action", "description"],
                    },
                  },
                  manual_steps: { type: "array", items: { type: "string" } },
                  severity: { type: "string", enum: ["low", "medium", "high"] },
                },
                required: ["diagnosis", "likely_cause", "auto_fixes", "manual_steps", "severity"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "diagnose_error" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte versuche es in einer Minute erneut." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Credits aufgebraucht." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback: try to parse content as JSON
      const content = data.choices?.[0]?.message?.content || "";
      try {
        const parsed = JSON.parse(content);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        throw new Error("No structured response from AI");
      }
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("diagnose-error error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
