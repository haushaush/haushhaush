import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_FILE_KEY = "9JmO2Q35aHgCxmxzaKw8xi";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function figmaFetch(url: string, token: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, { headers: { "X-Figma-Token": token } });
    if (resp.status === 429) {
      const wait = Math.min(2000 * Math.pow(2, i), 15000);
      console.log(`Figma 429, retrying in ${wait}ms (attempt ${i + 1}/${retries})`);
      await sleep(wait);
      continue;
    }
    return resp;
  }
  return await fetch(url, { headers: { "X-Figma-Token": token } });
}

function determineFormat(w: number, h: number): string {
  if (w === h) return "1:1";
  if (h > w * 1.5) return "9:16";
  if (w > h * 1.5) return "16:9";
  return "Andere";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();
    const FIGMA_TOKEN = Deno.env.get("FIGMA_ACCESS_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── PHASE 1: Fetch from Figma ───
    if (action === "fetch") {
      if (!FIGMA_TOKEN) {
        return new Response(
          JSON.stringify({ error: "FIGMA_ACCESS_TOKEN nicht konfiguriert" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get file structure (depth=1 for pages) with retry
      const fileResp = await figmaFetch(
        `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}?depth=1`,
        FIGMA_TOKEN
      );
      if (!fileResp.ok) {
        const t = await fileResp.text();
        console.error("Figma file error:", fileResp.status, t);
        if (fileResp.status === 429) {
          return new Response(
            JSON.stringify({ error: "Figma Rate Limit erreicht. Bitte warte 1-2 Minuten und versuche es erneut.", fallback: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Figma API Fehler", details: t }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fileData = await fileResp.json();
      const pages = fileData.document?.children ?? [];

      // Collect frames from each page with delay between requests
      const frames: { figma_node_id: string; name: string; width: number; height: number; format: string; figma_url: string }[] = [];

      for (let pi = 0; pi < pages.length; pi++) {
        const page = pages[pi];
        if (pi > 0) await sleep(1000); // 1s delay between page requests

        const nodeResp = await figmaFetch(
          `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/nodes?ids=${encodeURIComponent(page.id)}&depth=1`,
          FIGMA_TOKEN
        );
        if (!nodeResp.ok) continue;
        const nodeData = await nodeResp.json();
        const pageNode = nodeData.nodes?.[page.id]?.document;
        if (!pageNode?.children) continue;

        for (const node of pageNode.children) {
          if (node.type === "FRAME" || node.type === "COMPONENT") {
            const w = Math.round(node.absoluteBoundingBox?.width || 0);
            const h = Math.round(node.absoluteBoundingBox?.height || 0);
            frames.push({
              figma_node_id: node.id,
              name: node.name,
              width: w,
              height: h,
              format: determineFormat(w, h),
              figma_url: `https://www.figma.com/design/${FIGMA_FILE_KEY}?node-id=${encodeURIComponent(node.id)}`,
            });
          }
        }
      }

      // Fetch thumbnails in batches of 30 with delay
      for (let i = 0; i < frames.length; i += 30) {
        if (i > 0) await sleep(1500);
        const batch = frames.slice(i, i + 30);
        const ids = batch.map((f) => f.figma_node_id).join(",");
        try {
          const imgResp = await figmaFetch(
            `https://api.figma.com/v1/images/${FIGMA_FILE_KEY}?ids=${ids}&format=png&scale=0.5`,
            FIGMA_TOKEN
          );
          if (imgResp.ok) {
            const imgData = await imgResp.json();
            const images = imgData.images || {};
            batch.forEach((f) => {
              (f as any).thumbnail_url = images[f.figma_node_id] || null;
            });
          }
        } catch (e) {
          console.error("Thumbnail batch error:", e);
        }
      }

      // Upsert into creative_library
      let inserted = 0;
      for (const f of frames) {
        const { error } = await sb.from("creative_library").upsert(
          {
            figma_node_id: f.figma_node_id,
            figma_file_key: FIGMA_FILE_KEY,
            name: f.name,
            width: f.width,
            height: f.height,
            format: f.format,
            figma_url: f.figma_url,
            thumbnail_url: (f as any).thumbnail_url || null,
          },
          { onConflict: "figma_node_id" }
        );
        if (!error) inserted++;
      }

      return new Response(
        JSON.stringify({ total: frames.length, inserted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── PHASE 2: AI Analyze ───
    if (action === "analyze") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch unanalyzed
      const { data: unanalyzed, error: fetchErr } = await sb
        .from("creative_library")
        .select("*")
        .eq("analyzed", false)
        .limit(20);

      if (fetchErr) {
        return new Response(
          JSON.stringify({ error: fetchErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!unanalyzed || unanalyzed.length === 0) {
        // Count remaining
        const { count } = await sb.from("creative_library").select("*", { count: "exact", head: true }).eq("analyzed", false);
        return new Response(
          JSON.stringify({ analyzed: 0, remaining: count || 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let analyzedCount = 0;

      for (const creative of unanalyzed) {
        try {
          const messages: any[] = [
            {
              role: "system",
              content: "Du bist ein Ad Creative Analyst. Analysiere das Creative und antworte NUR als valides JSON ohne Markdown.",
            },
          ];

          const userContent: any[] = [
            {
              type: "text",
              text: `Analysiere dieses Ad Creative mit dem Namen "${creative.name}". Gib NUR valides JSON zurück: { "branche": eines von ["PKV", "BU", "Rechtsschutz", "TKV", "Unfallversicherung", "Automotive", "Handwerk", "Allfinanz", "Immobilien", "Andere"], "typ": eines von ["Hook", "Offer", "Social Proof", "UGC", "Testimonial", "Branding"], "hook_art": eines von ["Frage", "Aussage", "Statistik", "Testimonial", "Keiner"], "farben": { "primary": "#hex", "secondary": "#hex" } }`,
            },
          ];

          if (creative.thumbnail_url) {
            userContent.push({
              type: "image_url",
              image_url: { url: creative.thumbnail_url },
            });
          }

          messages.push({ role: "user", content: userContent });

          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages,
            }),
          });

          if (!aiResp.ok) {
            console.error("AI error for", creative.id, aiResp.status);
            continue;
          }

          const aiData = await aiResp.json();
          let content = aiData.choices?.[0]?.message?.content || "";
          content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

          const result = JSON.parse(content);

          await sb.from("creative_library").update({
            branche: result.branche || null,
            typ: result.typ || null,
            hook_art: result.hook_art || null,
            farben: result.farben || null,
            analyzed: true,
            analyzed_at: new Date().toISOString(),
          }).eq("id", creative.id);

          analyzedCount++;
        } catch (e) {
          console.error("Analyze error for", creative.id, e);
          // Mark as analyzed to avoid infinite retry
          await sb.from("creative_library").update({
            analyzed: true,
            analyzed_at: new Date().toISOString(),
            branche: "Andere",
            typ: "Branding",
            hook_art: "Keiner",
          }).eq("id", creative.id);
          analyzedCount++;
        }
      }

      // Count remaining
      const { count } = await sb.from("creative_library").select("*", { count: "exact", head: true }).eq("analyzed", false);

      return new Response(
        JSON.stringify({ analyzed: analyzedCount, remaining: count || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unbekannte Aktion" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-creative-library error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
