// n8n-proxy
// Unified proxy for n8n REST API v1. Reads instance_url + api_key from
// integration_settings (provider = 'n8n') and forwards calls.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mapHttpError(status: number, raw: unknown) {
  if (status === 401 || status === 403) {
    return { error: 'unauthorized', message: 'API Key ungültig, bitte in Einstellungen prüfen.', status };
  }
  if (status === 404) {
    return { error: 'not_found', message: 'n8n Instance oder Ressource nicht erreichbar.', status };
  }
  if (status >= 500) {
    return { error: 'server_error', message: 'n8n Server-Fehler — später erneut versuchen.', status };
  }
  return { error: 'request_failed', message: 'Anfrage fehlgeschlagen.', status, details: raw };
}

async function n8nFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { ok: res.ok, status: res.status, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Read latest n8n config (shared across users — admin-managed)
    const { data: settings } = await admin
      .from('integration_settings')
      .select('config')
      .eq('provider', 'n8n')
      .order('updated_at', { ascending: false })
      .limit(1);

    const cfg = (settings?.[0]?.config as Record<string, unknown> | undefined) ?? {};
    const instanceUrl = (cfg.instance_url as string | undefined)?.trim();
    const apiKey = (cfg.api_key as string | undefined)?.trim();

    if (!instanceUrl || !apiKey) {
      return json({
        error: 'not_configured',
        message: 'n8n nicht konfiguriert. Bitte Instance URL und API Key in den Einstellungen hinterlegen.',
      }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action as string | undefined;
    if (!action) return json({ error: 'missing_action' }, 400);

    // ─── Workflow actions ─────────────────────────────────────────────
    if (action === 'list_workflows') {
      const r = await n8nFetch(instanceUrl, apiKey, '/workflows?limit=250');
      if (!r.ok) return json(mapHttpError(r.status, r.body), r.status);
      const data = (r.body as any)?.data ?? r.body ?? [];
      return json({ workflows: Array.isArray(data) ? data : [] });
    }

    if (action === 'get_workflow') {
      const id = body.workflow_id as string | undefined;
      if (!id) return json({ error: 'missing_workflow_id' }, 400);
      const r = await n8nFetch(instanceUrl, apiKey, `/workflows/${encodeURIComponent(id)}`);
      if (!r.ok) return json(mapHttpError(r.status, r.body), r.status);
      return json({ workflow: r.body });
    }

    if (action === 'activate_workflow') {
      const id = body.workflow_id as string | undefined;
      if (!id) return json({ error: 'missing_workflow_id' }, 400);
      const r = await n8nFetch(instanceUrl, apiKey, `/workflows/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      if (!r.ok) return json(mapHttpError(r.status, r.body), r.status);
      return json({ ok: true, workflow: r.body });
    }

    if (action === 'deactivate_workflow') {
      const id = body.workflow_id as string | undefined;
      if (!id) return json({ error: 'missing_workflow_id' }, 400);
      const r = await n8nFetch(instanceUrl, apiKey, `/workflows/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
      if (!r.ok) return json(mapHttpError(r.status, r.body), r.status);
      return json({ ok: true, workflow: r.body });
    }

    if (action === 'execute_workflow') {
      const id = body.workflow_id as string | undefined;
      if (!id) return json({ error: 'missing_workflow_id' }, 400);
      // Public API doesn't expose a synchronous "run" endpoint for all versions.
      // We try the modern endpoint first; fall back to a webhook-style execute hint.
      const r = await n8nFetch(instanceUrl, apiKey, `/workflows/${encodeURIComponent(id)}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!r.ok) return json(mapHttpError(r.status, r.body), r.status);
      return json({ ok: true, execution: r.body });
    }

    // ─── Execution actions ────────────────────────────────────────────
    if (action === 'list_executions') {
      const params = new URLSearchParams();
      const limit = (body.limit as number | undefined) ?? 50;
      params.set('limit', String(limit));
      if (body.workflow_id) params.set('workflowId', String(body.workflow_id));
      if (body.status) params.set('status', String(body.status));
      const r = await n8nFetch(instanceUrl, apiKey, `/executions?${params.toString()}`);
      if (!r.ok) return json(mapHttpError(r.status, r.body), r.status);
      const data = (r.body as any)?.data ?? r.body ?? [];
      return json({ executions: Array.isArray(data) ? data : [] });
    }

    // ─── Aggregate stats for KPI bar ─────────────────────────────────
    if (action === 'stats_summary') {
      const [wfRes, execRes] = await Promise.all([
        n8nFetch(instanceUrl, apiKey, '/workflows?limit=250'),
        n8nFetch(instanceUrl, apiKey, '/executions?limit=250'),
      ]);
      if (!wfRes.ok) return json(mapHttpError(wfRes.status, wfRes.body), wfRes.status);
      if (!execRes.ok) return json(mapHttpError(execRes.status, execRes.body), execRes.status);
      const workflows = ((wfRes.body as any)?.data ?? []) as any[];
      const executions = ((execRes.body as any)?.data ?? []) as any[];

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const weekMs = 7 * dayMs;

      const today = executions.filter((e) => e.startedAt && now - new Date(e.startedAt).getTime() < dayMs);
      const last24h = today;
      const last7d = executions.filter((e) => e.startedAt && now - new Date(e.startedAt).getTime() < weekMs);

      const errors24h = last24h.filter((e) => e.status === 'error' || e.finished === false && e.stoppedAt).length;
      const successes7d = last7d.filter((e) => e.status === 'success').length;
      const total7d = last7d.length;
      const successRate7d = total7d > 0 ? Math.round((successes7d / total7d) * 100) : 0;

      return json({
        active_count: workflows.filter((w) => w.active).length,
        executions_today: today.length,
        errors_24h: errors24h,
        success_rate_7d: successRate7d,
      });
    }

    return json({ error: 'unknown_action', action }, 400);
  } catch (err) {
    console.error('n8n-proxy error:', err);
    return json({ error: (err as Error).message || 'unknown_error' }, 500);
  }
});
