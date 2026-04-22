// Figma connection test — validates Personal Access Token via /v1/me
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Kein Personal Access Token übergeben' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const res = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': token },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return new Response(
        JSON.stringify({
          ok: false,
          error: res.status === 403 ? 'Token ungültig oder abgelaufen' : `HTTP ${res.status}: ${txt.slice(0, 120)}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const user = await res.json();
    return new Response(
      JSON.stringify({
        ok: true,
        user: { email: user.email, handle: user.handle, img_url: user.img_url, id: user.id },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
