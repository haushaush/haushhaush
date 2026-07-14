// Diagnostic-only edge function for /meta/abrechnungen.
// Never returns secrets. Read-only tests against Meta Graph API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

const TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const APP_ID = Deno.env.get('META_APP_ID');
const APP_SECRET = Deno.env.get('META_APP_SECRET');
const BUSINESS_ID = Deno.env.get('META_BUSINESS_ID');
const API = 'https://graph.facebook.com/v19.0';

const RELEVANT_SCOPES = ['ads_read', 'ads_management', 'business_management', 'read_insights', 'pages_read_engagement'];

function sanitize(msg: string | undefined | null): string {
  if (!msg) return '';
  let s = String(msg);
  if (TOKEN) s = s.split(TOKEN).join('[REDACTED_TOKEN]');
  if (APP_SECRET) s = s.split(APP_SECRET).join('[REDACTED_SECRET]');
  return s;
}

function maskFunding(f: any): any {
  if (!f || typeof f !== 'object') return f;
  const out: any = { ...f };
  for (const k of ['id', 'account_id', 'display_string']) {
    if (typeof out[k] === 'string' && out[k].length > 4) {
      out[k] = `•••• ${out[k].slice(-4)}`;
    }
  }
  return { type_name: f.type_name ?? null, display_string: out.display_string ?? null };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T; error?: string; status?: number }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { ok: true, ms: Math.round(performance.now() - t0), value };
  } catch (e: any) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: sanitize(e?.message ?? String(e)), status: e?.status };
  }
}

async function metaFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has('access_token') && TOKEN) url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const err: any = new Error(sanitize(data?.error?.message || `HTTP ${res.status}`));
    err.status = res.status;
    err.code = data?.error?.code;
    err.subcode = data?.error?.error_subcode;
    err.endpoint = path;
    throw err;
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const t0 = performance.now();
  try {
    // Auth check via user token — admin only
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result: any = {
      generated_at: new Date().toISOString(),
      tests: {},
    };

    // TEST 1: function reachability = trivially yes if we're here
    result.tests.edge_function = {
      reachable: true,
      cors_ok: true,
      auth_ok: true,
      runtime_ms: 0, // patched below
    };

    // TEST 2: Secrets presence
    result.tests.secrets = {
      META_ACCESS_TOKEN: !!TOKEN,
      META_APP_ID: !!APP_ID,
      META_APP_SECRET: !!APP_SECRET,
      META_BUSINESS_ID: !!BUSINESS_ID,
    };

    if (!TOKEN) {
      result.overall = 'failed';
      result.tests.edge_function.runtime_ms = Math.round(performance.now() - t0);
      return new Response(JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // TEST 3: Token diagnostics
    const tokenTest = await timed(async () => {
      const me = await metaFetch('/me', { fields: 'id,name' });
      let debug: any = null;
      if (APP_ID && APP_SECRET) {
        try {
          debug = await metaFetch('/debug_token', {
            input_token: TOKEN,
            access_token: `${APP_ID}|${APP_SECRET}`,
          });
        } catch (e: any) {
          debug = { error: sanitize(e?.message) };
        }
      }
      return { me: { id: me.id, name: me.name }, debug };
    });
    const tokDebug = tokenTest.value?.debug?.data;
    result.tests.token = {
      valid: tokenTest.ok,
      runtime_ms: tokenTest.ms,
      error: tokenTest.error,
      status: tokenTest.status,
      type: tokDebug?.type ?? null,
      app_id: tokDebug?.app_id ?? APP_ID ?? null,
      expires_at: tokDebug?.expires_at ? new Date(tokDebug.expires_at * 1000).toISOString() : null,
      data_access_expires_at: tokDebug?.data_access_expires_at
        ? new Date(tokDebug.data_access_expires_at * 1000).toISOString() : null,
      is_valid: tokDebug?.is_valid ?? null,
      scopes: tokDebug?.scopes ?? null,
      relevant_scopes: tokDebug?.scopes
        ? RELEVANT_SCOPES.filter((s) => tokDebug.scopes.includes(s))
        : null,
      scopes_note: tokDebug?.scopes
        ? null
        : 'Scopes konnten nicht direkt ausgelesen werden. Verfügbarkeit wird über API-Testaufrufe geprüft.',
    };

    // TEST 4: Accessible ad accounts
    const accountsTest = await timed(async () => {
      const byId = new Map<string, any>();
      const sources: Record<string, number> = {};
      let paginationComplete = true;

      async function collect(path: string, source: string) {
        let url: string | null = `${API}${path}?fields=id,account_id,name,account_status,currency&limit=200&access_token=${TOKEN}`;
        let pages = 0;
        while (url && pages < 20) {
          const res = await fetch(url);
          const data = await res.json();
          if (data?.error) throw new Error(sanitize(data.error.message));
          for (const a of data?.data ?? []) {
            const id = a.id || (a.account_id ? `act_${a.account_id}` : null);
            if (!id) continue;
            if (!byId.has(id)) {
              byId.set(id, { ...a, _source: source });
              sources[source] = (sources[source] || 0) + 1;
            }
          }
          url = data?.paging?.next || null;
          pages++;
        }
        if (url) paginationComplete = false;
      }

      const errs: any[] = [];
      if (BUSINESS_ID) {
        try { await collect(`/${BUSINESS_ID}/owned_ad_accounts`, 'Owned'); }
        catch (e: any) { errs.push({ endpoint: 'owned_ad_accounts', message: sanitize(e?.message) }); }
        try { await collect(`/${BUSINESS_ID}/client_ad_accounts`, 'Client Account'); }
        catch (e: any) { errs.push({ endpoint: 'client_ad_accounts', message: sanitize(e?.message) }); }
      }
      try { await collect('/me/adaccounts', '/me/adaccounts'); }
      catch (e: any) { errs.push({ endpoint: '/me/adaccounts', message: sanitize(e?.message) }); }

      const all = Array.from(byId.values());
      return {
        total: all.length,
        active: all.filter((a) => a.account_status === 1).length,
        inactive: all.filter((a) => a.account_status !== 1).length,
        sources,
        pagination_complete: paginationComplete,
        errors: errs,
        sample: all.slice(0, 20).map((a) => ({
          id: a.id,
          account_id: a.account_id,
          name: a.name,
          status: a.account_status === 1 ? 'active' : 'inactive',
          currency: a.currency,
          source: a._source,
        })),
        first_account_id: all[0]?.id ?? null,
      };
    });
    result.tests.accounts = {
      ok: accountsTest.ok,
      runtime_ms: accountsTest.ms,
      error: accountsTest.error,
      ...(accountsTest.value ?? {}),
    };
    const testAccountId: string | null = accountsTest.value?.first_account_id ?? null;

    // TEST 5: Account field availability
    const FIELDS = ['id', 'name', 'account_id', 'account_status', 'currency', 'amount_spent', 'balance', 'spend_cap', 'funding_source_details'];
    if (testAccountId) {
      const fieldsTest = await timed(async () => {
        const acc = await metaFetch(`/${testAccountId}`, { fields: FIELDS.join(',') });
        return acc;
      });
      const fieldRows = FIELDS.map((f) => {
        const raw = fieldsTest.value?.[f];
        let status: string;
        let example: any = null;
        if (!fieldsTest.ok) status = 'API-Fehler';
        else if (raw === undefined) status = 'Nicht unterstützt';
        else if (raw === null || raw === '') status = 'Leer';
        else {
          status = 'Verfügbar';
          if (f === 'funding_source_details') example = maskFunding(raw);
          else if (typeof raw === 'object') example = '[object]';
          else example = String(raw).slice(0, 40);
        }
        return { field: f, status, example };
      });
      result.tests.fields = {
        ok: fieldsTest.ok,
        runtime_ms: fieldsTest.ms,
        error: fieldsTest.error,
        account_id: testAccountId,
        rows: fieldRows,
      };
    } else {
      result.tests.fields = { ok: false, error: 'Kein Testkonto verfügbar', rows: [] };
    }

    // TEST 6: Insights
    if (testAccountId) {
      const insightsTest = await timed(async () => {
        const now = new Date();
        const since = new Date(now); since.setDate(since.getDate() - 7);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const data = await metaFetch(`/${testAccountId}/insights`, {
          fields: 'spend,impressions,account_currency',
          time_range: JSON.stringify({ since: fmt(since), until: fmt(now) }),
          level: 'account',
        });
        const rows = data?.data ?? [];
        return {
          rows: rows.length,
          spend_available: rows.some((r: any) => r.spend != null),
          currency: rows[0]?.account_currency ?? null,
        };
      });
      result.tests.insights = {
        ok: insightsTest.ok,
        runtime_ms: insightsTest.ms,
        error: insightsTest.error,
        ...(insightsTest.value ?? {}),
      };
    } else {
      result.tests.insights = { ok: false, error: 'Kein Testkonto verfügbar' };
    }

    // TEST 7: Invoices / Payments — probe unsupported endpoints
    async function probe(path: string) {
      const t = await timed(() => metaFetch(path, { limit: '1' }));
      return {
        supported: t.ok,
        runtime_ms: t.ms,
        error: t.error ?? null,
        status: t.status ?? null,
        note: t.ok ? null : 'Nicht über die aktuell verwendete Meta API verfügbar',
      };
    }
    if (testAccountId) {
      result.tests.invoices = await probe(`/${testAccountId}/invoices`);
      result.tests.payments = await probe(`/${testAccountId}/payments`);
    } else {
      result.tests.invoices = { supported: false, note: 'Nicht über die aktuell verwendete Meta API verfügbar' };
      result.tests.payments = { supported: false, note: 'Nicht über die aktuell verwendete Meta API verfügbar' };
    }

    // Overall
    const critical = [
      result.tests.token.valid,
      result.tests.accounts.ok,
    ];
    const partial = [
      result.tests.fields?.ok,
      result.tests.insights?.ok,
    ];
    result.overall = critical.every(Boolean)
      ? (partial.every(Boolean) ? 'success' : 'partial')
      : 'failed';

    result.tests.edge_function.runtime_ms = Math.round(performance.now() - t0);

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: sanitize(e?.message ?? 'Unknown error') }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
