const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOSE_API_KEY = Deno.env.get('CLOSE_API_KEY');
const CLOSE_BASE = 'https://api.close.com/api/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!CLOSE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'CLOSE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { endpoint, method = 'GET', body } = await req.json();

    if (!endpoint || typeof endpoint !== 'string') {
      return new Response(
        JSON.stringify({ error: 'endpoint required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${CLOSE_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    // Close API uses Basic Auth: api_key as username, no password
    const auth = btoa(`${CLOSE_API_KEY}:`);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
