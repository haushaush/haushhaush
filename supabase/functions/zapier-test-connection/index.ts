// Zapier connection test — runs 4 health checks
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { api_key, webhook_base } = await req.json().catch(() => ({}));
    const checks: CheckResult[] = [];

    // 1. Zapier API reachable
    let apiReachable = false;
    try {
      const res = await fetch('https://api.zapier.com/v1/', { method: 'GET' });
      apiReachable = res.status < 500;
    } catch { /* unreachable */ }
    checks.push({
      id: 'zapier_reachable',
      label: 'Zapier API erreichbar',
      ok: apiReachable,
      detail: apiReachable ? undefined : 'api.zapier.com nicht erreichbar',
    });

    // 2. API Key valid
    let keyValid = false;
    let keyDetail: string | undefined;
    if (api_key) {
      try {
        const res = await fetch('https://api.zapier.com/v1/user/connected-accounts', {
          headers: { Authorization: `Bearer ${api_key}` },
        });
        keyValid = res.ok;
        if (!res.ok) keyDetail = `HTTP ${res.status}`;
      } catch (e) {
        keyDetail = 'Netzwerkfehler';
      }
    } else {
      keyDetail = 'Kein API Key gesetzt';
    }
    checks.push({ id: 'api_key_valid', label: 'API Key gültig', ok: keyValid, detail: keyDetail });

    // 3. Webhook URL reachable
    let webhookOk = false;
    let webhookDetail: string | undefined;
    if (webhook_base && webhook_base.startsWith('https://hooks.zapier.com/')) {
      try {
        // HEAD/GET to test reachability — Zapier hooks accept POST but should not 404 on base
        const res = await fetch(webhook_base, { method: 'GET' });
        webhookOk = res.status < 500;
        if (!webhookOk) webhookDetail = `HTTP ${res.status}`;
      } catch {
        webhookDetail = 'Hook nicht erreichbar';
      }
    } else {
      webhookDetail = webhook_base ? 'Ungültige Hook URL' : 'Keine Webhook URL gesetzt';
    }
    checks.push({ id: 'webhook_reachable', label: 'Webhook URL erreichbar', ok: webhookOk, detail: webhookDetail });

    // 4. Webhook endpoint ready (our own receiver)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    let endpointOk = false;
    let endpointDetail: string | undefined;
    try {
      const endpoint = `${supabaseUrl}/functions/v1/zapier-webhook`;
      const res = await fetch(endpoint, { method: 'OPTIONS' });
      endpointOk = res.status < 500;
      if (!endpointOk) endpointDetail = `HTTP ${res.status}`;
    } catch {
      endpointDetail = 'Endpoint nicht erreichbar';
    }
    checks.push({ id: 'webhook_endpoint_ready', label: 'Webhook Endpoint bereit', ok: endpointOk, detail: endpointDetail });

    return new Response(JSON.stringify({ checks }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
