const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get('ONEPAGE_API_KEY') ?? 'c0fb8a92-8cf5-465b-aaf5-0ee35c193c37';

const BASE_URLS = [
  'https://api.onepage.io/v1/pages',
  'https://api.onepage.io/v1/leads',
  'https://api.onepage.io/v1/sites',
  'https://api.onepage.io/v1/forms',
  'https://api.onepage.io/v1/submissions',
  'https://api.onepage.io/v1/contacts',
  'https://api.onepage.io/v1/projects',
  'https://app.onepage.io/api/v1/pages',
  'https://app.onepage.io/api/v1/leads',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const results = await Promise.all(
    BASE_URLS.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json',
          },
        });
        const text = await res.text();
        return {
          url,
          status: res.status,
          contentType: res.headers.get('content-type'),
          body: text.slice(0, 500),
        };
      } catch (err) {
        return { url, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
