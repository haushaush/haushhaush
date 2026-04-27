import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractLead } from "../_shared/lead-extractor.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-test-mode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const body = await req.json().catch(() => null);
    const { logId, testMode } = (body || {}) as { logId?: string; testMode?: boolean };
    if (!logId) return json({ error: 'logId is required' }, 400);

    // Permission check
    const authHeader = req.headers.get('Authorization');
    const testModeHeader = req.headers.get('x-test-mode') === 'true' || testMode === true;
    let allowed = false;

    if (authHeader?.startsWith('Bearer ') && !testModeHeader) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (userRes?.user) {
        const { data: roleCheck } = await userClient.rpc('is_admin_or_manager', {
          _user_id: userRes.user.id,
        });
        allowed = roleCheck === true;
      }
    } else if (testModeHeader) {
      allowed = true;
    }

    if (!allowed) return json({ error: 'Forbidden — admin or account-manager required' }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load log entry
    const { data: log, error: logErr } = await admin
      .from('onepage_webhook_logs')
      .select('*')
      .eq('id', logId)
      .maybeSingle();
    if (logErr) return json({ error: `Log lookup failed: ${logErr.message}` }, 500);
    if (!log) return json({ error: 'Log entry not found' }, 404);

    // Resolve project (prefer project_id, fall back to token lookup)
    let projectId: string | null = log.project_id;
    if (!projectId && log.token) {
      const { data: proj } = await admin
        .from('onepage_projects')
        .select('id')
        .eq('webhook_secret', log.token)
        .maybeSingle();
      projectId = proj?.id ?? null;
    }
    if (!projectId) return json({ error: 'No project resolvable for this log' }, 400);

    const extracted = extractLead(log.payload || {});

    // Dedupe (project_id + email + received_at)
    if (extracted.email) {
      const { data: existing } = await admin
        .from('onepage_project_leads')
        .select('id')
        .eq('project_id', projectId)
        .eq('email', extracted.email)
        .eq('received_at', extracted.created_at)
        .maybeSingle();
      if (existing) {
        await admin
          .from('onepage_webhook_logs')
          .update({ status: 'reprocessed_duplicate' })
          .eq('id', logId);
        return json({ ok: true, duplicate: true, extracted });
      }
    }

    const lead = {
      project_id: projectId,
      vorname: extracted.vorname,
      nachname: extracted.nachname,
      email: extracted.email,
      telefon: extracted.telefon,
      unternehmen: extracted.unternehmen,
      nachricht: extracted.nachricht,
      utm_source: extracted.utm_source,
      utm_medium: extracted.utm_medium,
      utm_campaign: extracted.utm_campaign,
      utm_content: extracted.utm_content,
      utm_term: extracted.utm_term,
      received_at: extracted.created_at,
      imported_via: 'webhook_reprocessed',
      source: 'webhook',
      payload: {
        ...(log.payload || {}),
        _form_name: extracted.form_name,
        _reprocessed_from_log: logId,
      },
    };

    const { error: insertErr } = await admin
      .from('onepage_project_leads')
      .insert(lead);

    if (insertErr) {
      if (insertErr.code === '23505') {
        await admin
          .from('onepage_webhook_logs')
          .update({ status: 'reprocessed_duplicate' })
          .eq('id', logId);
        return json({ ok: true, duplicate: true, extracted });
      }
      return json({ error: `Insert failed: ${insertErr.message}` }, 500);
    }

    await admin
      .from('onepage_webhook_logs')
      .update({ status: 'reprocessed', error: null, project_id: projectId })
      .eq('id', logId);

    return json({ ok: true, extracted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
