import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_FILE_KEY = "9JmO2Q35aHgCxmxzaKw8xi";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIGMA_TOKEN = Deno.env.get("FIGMA_ACCESS_TOKEN");
    if (!FIGMA_TOKEN) {
      return new Response(
        JSON.stringify({ error: "FIGMA_ACCESS_TOKEN ist nicht konfiguriert. Bitte in den Einstellungen hinterlegen." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();

    // ─── List frames from Figma file ───
    if (action === "list_frames") {
      // Fetch full file structure (depth=2 to keep response small)
      const url = `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}?depth=2`;
      const resp = await fetch(url, {
        headers: { "X-Figma-Token": FIGMA_TOKEN },
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Figma API error:", resp.status, text);
        return new Response(
          JSON.stringify({ error: "Figma API Fehler", details: text }),
          { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await resp.json();

      // Extract all frames from all pages
      const frames: { id: string; name: string; pageId: string; pageName: string; thumbnailUrl: string; figmaUrl: string }[] = [];
      for (const page of data.document?.children ?? []) {
        for (const node of page.children ?? []) {
          if (node.type === "FRAME" || node.type === "COMPONENT") {
            frames.push({
              id: node.id,
              name: node.name,
              pageId: page.id,
              pageName: page.name,
              thumbnailUrl: "",
              figmaUrl: `https://www.figma.com/design/${FIGMA_FILE_KEY}?node-id=${encodeURIComponent(node.id)}`,
            });
          }
        }
      }

      // Fetch real thumbnails for first 50 frames
      const toFetch = frames.slice(0, 50);
      if (toFetch.length > 0) {
        const nodeIds = toFetch.map(f => f.id).join(",");
        const imgUrl = `https://api.figma.com/v1/images/${FIGMA_FILE_KEY}?ids=${nodeIds}&format=png&scale=0.5`;
        const imgResp = await fetch(imgUrl, {
          headers: { "X-Figma-Token": FIGMA_TOKEN },
        });
        if (imgResp.ok) {
          const imgData = await imgResp.json();
          const images = imgData.images || {};
          frames.forEach(f => {
            if (images[f.id]) f.thumbnailUrl = images[f.id];
          });
        }
      }

      return new Response(
        JSON.stringify({ frames }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Generate brief using AI ───
    if (action === "generate_brief") {
      const { brief } = params;
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const prompt = `Du bist ein Senior Performance Marketing Creative Strategist. Erstelle einen Ad Creative Brief basierend auf diesen Inputs:

Kunde: ${brief.kunde}
Branche: ${brief.branche}
Produkt/Angebot: ${brief.produkt}
Zielgruppe: ${brief.zielgruppe || "Nicht angegeben"}
Plattform: ${brief.plattform || "Meta"}
Format: ${brief.format || "1:1"}
Hook-Typ: ${brief.hookTyp || "Frage"}

Antworte NUR als JSON mit exakt dieser Struktur (keine Markdown, kein Code-Block):
{
  "headlines": ["Headline 1", "Headline 2", "Headline 3"],
  "hookText": "Der Hook-Text",
  "bodyCopy": "Der Body Copy Text",
  "cta": "Der Call-to-Action",
  "primaryColor": "#hexcode",
  "secondaryColor": "#hexcode"
}

Regeln:
- Headlines sollen kurz, prägnant und aufmerksamkeitsstark sein
- Hook-Text passt zum gewählten Hook-Typ
- Body Copy ist überzeugend und auf die Zielgruppe zugeschnitten
- CTA ist handlungsorientiert
- Farben passen zur Branche und wirken professionell`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Du bist ein Ad Creative Experte. Antworte immer auf Deutsch und ausschließlich als valides JSON." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        const status = aiResp.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte warte einen Moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "Credits aufgebraucht. Bitte Guthaben aufladen." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResp.text();
        console.error("AI error:", status, t);
        return new Response(JSON.stringify({ error: "KI-Fehler" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResp.json();
      let content = aiData.choices?.[0]?.message?.content || "";
      // Strip markdown code blocks if present
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      try {
        const result = JSON.parse(content);
        return new Response(
          JSON.stringify({ result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        console.error("Failed to parse AI response:", content);
        return new Response(
          JSON.stringify({ error: "KI-Antwort konnte nicht verarbeitet werden", raw: content }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Duplicate frame and fill text ───
    if (action === "duplicate_and_fill") {
      // Note: Figma REST API doesn't support direct frame duplication.
      // This would require the Figma Plugin API. For now, return the reference link.
      const { nodeId } = params;
      const figmaUrl = `https://www.figma.com/file/${FIGMA_FILE_KEY}?node-id=${encodeURIComponent(nodeId)}`;

      return new Response(
        JSON.stringify({
          figmaUrl,
          thumbnailUrl: null,
          note: "Figma REST API unterstützt keine direkte Frame-Duplizierung. Bitte öffne die Vorlage in Figma und dupliziere sie manuell.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unbekannte Aktion" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("figma-creatives error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
