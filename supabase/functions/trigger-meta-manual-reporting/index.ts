// trigger-meta-manual-reporting
// Called from the app (admin only). Triggers the n8n manual reporting webhook
// for EXACTLY ONE Meta ad account. Never sends a batch/array of accounts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_URL = Deno.env.get('N8N_MANUAL_REPORTING_WEBHOOK_URL');
const N8N_SECRET = Deno.env.get('N8N_META_REPORTING_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeAccountId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.startsWith('act_') ? s : `act_${s}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!WEBHOOK_URL || !N8N_SECRET) {
    return json(
      { error: 'not_configured', message: 'N8N_MANUAL_REPORTING_WEBHOOK_URL / N8N_META_REPORTING_SECRET missing' },
      500,
    );
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);

  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return json({ error: 'forbidden', message: 'admin only' }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const metaAccountId = normalizeAccountId(body?.meta_account_id);
  if (!metaAccountId) return json({ error: 'missing_meta_account_id' }, 400);
  const metaAccountName = body?.meta_account_name ? String(body.meta_account_name).slice(0, 300) : null;

  const payload = {
    meta_account_id: metaAccountId,
    meta_account_name: metaAccountName,
    trigger_source: 'lovable_manual',
    triggered_by: user.id,
  };

  let res: Response;
  try {
    res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-N8N-Secret': N8N_SECRET },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: 'webhook_unreachable', message: String((e as Error)?.message ?? e) }, 502);
  }

  const text = await res.text();
  if (!res.ok) {
    await admin
      .from('meta_reporting_settings')
      .update({
        last_report_status: 'failed',
        last_report_trigger_source: 'lovable_manual',
        last_report_attempted_at: new Date().toISOString(),
        last_report_error: `n8n ${res.status}: ${text.slice(0, 500)}`,
      })
      .eq('meta_account_id', metaAccountId);
    return json({ error: 'webhook_failed', status: res.status, message: text.slice(0, 500) }, 502);
  }

  await admin
    .from('meta_reporting_settings')
    .update({
      last_report_trigger_source: 'lovable_manual',
      last_report_attempted_at: new Date().toISOString(),
      last_report_error: null,
    })
    .eq('meta_account_id', metaAccountId);

  return json({ success: true, meta_account_id: metaAccountId });
});
