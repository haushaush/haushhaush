import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { showcase_id, url } = await req.json();
    if (!showcase_id || !url) {
      return new Response(JSON.stringify({ error: 'showcase_id and url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let isBlocked = false;
    let reason = 'ok';

    try {
      const fetchOpts: RequestInit = {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HaushBot/1.0; +https://haushhaush.de)',
        },
      };
      const res = await fetch(url, fetchOpts);
      const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase();
      const csp = (res.headers.get('content-security-policy') ?? '').toLowerCase();

      if (xfo.includes('deny') || xfo.includes('sameorigin')) {
        isBlocked = true;
        reason = `x-frame-options: ${xfo}`;
      } else if (/frame-ancestors\s+(?:'none'|'self'(?!\s+\*)|(?!.*\*)[^;]*)/i.test(csp)) {
        isBlocked = true;
        reason = 'CSP frame-ancestors restricts embedding';
      }
      console.log(`[check-website-embeddable] ${url} → blocked=${isBlocked} (${reason})`);
    } catch (e: any) {
      console.warn(`[check-website-embeddable] fetch failed for ${url}:`, e?.message ?? e);
      // Network error / timeout → don't mark as blocked
      isBlocked = false;
      reason = 'fetch_failed';
    }

    const { error } = await supabase
      .from('referenz_showcase')
      .update({
        is_iframe_blocked: isBlocked,
        iframe_check_at: new Date().toISOString(),
      })
      .eq('id', showcase_id);

    if (error) {
      console.error('update error', error);
    }

    return new Response(JSON.stringify({ is_blocked: isBlocked, reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
