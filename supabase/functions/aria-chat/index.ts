import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Du bist ARIA, der KI-Assistent von Agency Hub — dem internen Dashboard von Viral Connect GmbH & Haush Haush Digital UG in Paderborn.

VERHALTEN:
- Antworte immer auf Deutsch, kurz und direkt
- Wenn du eine Aktion ausführst, erkläre kurz was du tust
- Bei unklaren Anfragen: nachfragen, nicht raten
- Du kennst die Versicherungsbranche (PKV, BU, TKV, Beihilfe)
- Du kannst Portal-Aktionen ausführen indem du JSON zurückgibst: {"action": "ACTION_NAME", "params": {...}}

VERFÜGBARE AKTIONEN:
- navigate: {"action":"navigate","params":{"path":"/kunden"}} — Navigiert zu einer Seite
- search_client: {"action":"search_client","params":{"name":"Kehlenbach"}} — Sucht einen Kunden
- show_kpi: {"action":"show_kpi","params":{"section":"sales"}} — Zeigt KPI Dashboard
- create_task: {"action":"create_task","params":{"title":"...","client_id":"...","due_date":"..."}} — Erstellt Aufgabe
- mark_task_done: {"action":"mark_task_done","params":{"task_id":"..."}} — Aufgabe erledigen
- update_ampel: {"action":"update_ampel","params":{"client_id":"...","status":"Grün|Gelb|Rot"}} — Ampelstatus ändern

Wenn der Nutzer nach Daten fragt die du nicht hast, schlage vor die entsprechende Seite zu öffnen.
Formatiere Antworten mit Markdown wenn sinnvoll.`;

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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte warte kurz." }), {
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
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI-Fehler aufgetreten" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("aria-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
