import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);

    const { url } = await req.json();
    if (!url || typeof url !== 'string') return jsonResponse({ ok: false, error: 'url required' }, 400);

    // Use Microlink free API
    const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&viewport.width=1280&viewport.height=800&screenshot.type=jpeg`;
    const resp = await fetch(microlinkUrl);
    if (!resp.ok) {
      const text = await resp.text();
      return jsonResponse({ ok: false, error: `Microlink failed: ${resp.status} ${text.slice(0, 200)}` }, 502);
    }

    const data = await resp.json();
    const remoteUrl = data?.data?.screenshot?.url;
    if (!remoteUrl) {
      return jsonResponse({ ok: false, error: 'No screenshot returned by Microlink', raw: data?.status }, 502);
    }

    // Download the image and persist to storage
    const imgResp = await fetch(remoteUrl);
    if (!imgResp.ok) {
      return jsonResponse({ ok: false, error: `Image download failed: ${imgResp.status}` }, 502);
    }
    const buf = new Uint8Array(await imgResp.arrayBuffer());
    if (buf.byteLength < 2000) {
      return jsonResponse({ ok: false, error: 'Screenshot too small (likely empty)' }, 502);
    }

    const admin = createClient(supabaseUrl, supabaseService);
    const filename = `websites/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from('referenz-showcase')
      .upload(filename, buf, { contentType: 'image/jpeg', upsert: true });
    if (upErr) return jsonResponse({ ok: false, error: upErr.message }, 500);

    const { data: pub } = admin.storage.from('referenz-showcase').getPublicUrl(filename);
    return jsonResponse({ ok: true, screenshot_url: pub.publicUrl, bytes: buf.byteLength });
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message }, 500);
  }
});
