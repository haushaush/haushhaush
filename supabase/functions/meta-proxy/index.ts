// Meta Graph API Proxy
// Forwards requests to Facebook Graph API using server-side access token

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const BUSINESS_ID = Deno.env.get('META_BUSINESS_ID');
const API_VERSION = 'v19.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'META_ACCESS_TOKEN not configured. Bitte in den Einstellungen ergänzen.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { endpoint, params, method } = await req.json();

    if (!endpoint || typeof endpoint !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing required field: endpoint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Replace {business_id} placeholder
    const resolvedEndpoint = endpoint.replace('{business_id}', BUSINESS_ID || '');
    const path = resolvedEndpoint.startsWith('/') ? resolvedEndpoint : `/${resolvedEndpoint}`;
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('access_token', ACCESS_TOKEN);

    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
      });
    }

    const res = await fetch(url.toString(), { method: method || 'GET' });
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('meta-proxy error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
