// update-meta-reporting-status
// Called by n8n (one account per request) to report the outcome of a reporting run.
// Only ever writes status fields — never customer data, never reporting_email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-n8n-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const N8N_SECRET = Deno.env.get('N8N_META_REPORTING_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function variants(raw: unknown): { prefixed: string; numeric: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { prefixed: '', numeric: '' };
  return {
    prefixed: s.startsWith('act_') ? s : `act_${s}`,
    numeric: s.startsWith('act_') ? s.slice(4) : s,
  };
}

const REPORT_STATUS = ['success', 'partial', 'failed', 'skipped'];
const SLACK_STATUS = ['sent', 'skipped', 'failed', 'disabled'];
const EMAIL_STATUS = ['sent', 'skipped', 'failed', 'disabled', 'missing_email'];

function str(v: unknown, max = 1000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function ts(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!N8N_SECRET) return json({ error: 'not_configured' }, 500);
  const provided = req.headers.get('x-n8n-secret');
  if (!provided || provided !== N8N_SECRET) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const v = variants(body?.meta_account_id);
  if (!v.prefixed) return json({ error: 'missing_meta_account_id' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: findErr } = await admin
    .from('meta_reporting_settings')
    .select('id, meta_account_id')
    .in('meta_account_id', [v.prefixed, v.numeric]);
  if (findErr) return json({ error: 'db_error', message: findErr.message }, 500);
  const row = (rows ?? [])[0];
  if (!row) return json({ error: 'not_found', meta_account_id: v.prefixed }, 404);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { last_report_attempted_at: now };

  const status = str(body?.status, 30);
  if (status && REPORT_STATUS.includes(status)) {
    update.last_report_status = status;
    update.last_report_error = str(body?.error, 2000);
    if (status === 'success' || status === 'partial') {
      update.last_report_success_at = ts(body?.success_at) ?? now;
    }
  }
  const triggerSource = str(body?.trigger_source, 40);
  if (triggerSource) update.last_report_trigger_source = triggerSource;
  const periodLabel = str(body?.period_label, 120);
  if (periodLabel) update.last_report_period_label = periodLabel;

  const slack = body?.slack;
  if (slack && typeof slack === 'object') {
    const explicit = str(slack.status, 30);
    const derived =
      explicit && SLACK_STATUS.includes(explicit)
        ? explicit
        : slack.enabled === false
          ? 'disabled'
          : slack.error
            ? 'failed'
            : slack.sent === true
              ? 'sent'
              : 'skipped';
    update.last_slack_status = derived;
    update.last_slack_error = str(slack.error, 2000);
    if (derived === 'sent') update.last_slack_sent_at = ts(slack.sent_at) ?? now;
  }

  const email = body?.email;
  if (email && typeof email === 'object') {
    const explicit = str(email.status, 30);
    const derived =
      explicit && EMAIL_STATUS.includes(explicit)
        ? explicit
        : email.enabled === false
          ? 'disabled'
          : email.error
            ? 'failed'
            : email.sent === true
              ? 'sent'
              : !email.to
                ? 'missing_email'
                : 'skipped';
    update.last_email_status = derived;
    update.last_email_error = str(email.error, 2000);
    update.last_email_to = str(email.to, 320);
    if (derived === 'sent') update.last_email_sent_at = ts(email.sent_at) ?? now;
  }

  const { error: updErr } = await admin
    .from('meta_reporting_settings')
    .update(update)
    .eq('id', row.id);
  if (updErr) return json({ error: 'db_error', message: updErr.message }, 500);

  return json({ success: true, meta_account_id: row.meta_account_id, updated: Object.keys(update) });
});
