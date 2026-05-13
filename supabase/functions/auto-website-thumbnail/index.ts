import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return jsonError("Invalid URL", 400);
    }

    let imageBuffer: ArrayBuffer | null = null;
    let source = "";

    // STRATEGY 1: Microlink screenshot (embed=screenshot.url returns the image directly)
    try {
      const microlinkUrl =
        `https://api.microlink.io/?url=${encodeURIComponent(url)}` +
        `&screenshot=true&meta=false&embed=screenshot.url` +
        `&waitUntil=networkidle0&viewport.width=1440&viewport.height=810&viewport.deviceScaleFactor=2`;

      const res = await fetch(microlinkUrl, { signal: AbortSignal.timeout(25000) });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && ct.startsWith("image/")) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 2000) {
          imageBuffer = buf;
          source = "microlink";
        }
      }
    } catch (e) {
      console.warn("Microlink failed:", (e as Error).message);
    }

    // STRATEGY 2: OpenGraph image fallback
    if (!imageBuffer) {
      try {
        const htmlRes = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ThumbnailBot/1.0)" },
        });
        const html = await htmlRes.text();

        const ogMatch =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

        if (ogMatch?.[1]) {
          let ogImageUrl = ogMatch[1];
          if (ogImageUrl.startsWith("//")) {
            ogImageUrl = `https:${ogImageUrl}`;
          } else if (ogImageUrl.startsWith("/")) {
            const u = new URL(url);
            ogImageUrl = `${u.protocol}//${u.host}${ogImageUrl}`;
          }

          const imgRes = await fetch(ogImageUrl, { signal: AbortSignal.timeout(10000) });
          if (imgRes.ok) {
            const buf = await imgRes.arrayBuffer();
            if (buf.byteLength > 2000) {
              imageBuffer = buf;
              source = "opengraph";
            }
          }
        }
      } catch (e) {
        console.warn("OG-Image failed:", (e as Error).message);
      }
    }

    if (!imageBuffer) {
      return jsonError("Konnte kein Thumbnail erstellen — bitte manuell hochladen", 422);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const filename = `auto-thumbnails/${crypto.randomUUID()}.jpg`;
    const { error: uploadErr } = await supabase.storage
      .from("referenz-showcase")
      .upload(filename, imageBuffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from("referenz-showcase")
      .getPublicUrl(filename);

    return new Response(
      JSON.stringify({ thumbnail_url: publicUrl, source }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Auto-thumbnail failed:", e);
    return jsonError((e as Error).message, 500);
  }
});
