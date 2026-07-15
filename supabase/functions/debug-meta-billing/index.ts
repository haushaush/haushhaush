// Diagnostic-only edge function for /meta/abrechnungen.
// Never returns secrets. Read-only tests against Meta Graph API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

// Billing-only token — MUST NOT fall back to META_ACCESS_TOKEN.
// Falls das Secret fehlt, wird ein klarer Fehler ausgegeben, damit
// die Abrechnungs-Diagnose nicht versehentlich auf den Haupt-Token zugreift.
const TOKEN = Deno.env.get('META_BILLING_ACCESS_TOKEN');
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
      META_BILLING_ACCESS_TOKEN: !!TOKEN,
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

    // TEST 7: Business Invoices — official /{BUSINESS_ID}/business_invoices edge
    // Ref: https://developers.facebook.com/docs/marketing-api/reference/business/business_invoices
    if (!BUSINESS_ID) {
      result.tests.business_id = { present: false, note: 'Keine Meta Business ID konfiguriert' };
      result.tests.invoices = {
        state: 'no_business_id',
        supported: false,
        note: 'Keine Meta Business ID konfiguriert',
      };
    } else {
      const maskedBiz = `•••• ${BUSINESS_ID.slice(-4)}`;
      result.tests.business_id = { present: true, masked: maskedBiz };

      const since = new Date();
      since.setMonth(since.getMonth() - 12);
      const startDate = since.toISOString().slice(0, 10);

      const invTest = await timed(async () => {
        const items: any[] = [];
        const fieldSet = new Set<string>();
        const currencies = new Set<string>();
        const statuses = new Set<string>();
        let pages = 0;
        let paginationComplete = true;
        let firstError: any = null;
        let downloadableCount = 0;
        let minDate: string | null = null;
        let maxDate: string | null = null;

        let url: string | null =
          `${API}/${BUSINESS_ID}/business_invoices` +
          `?start_date=${startDate}` +
          `&limit=100&access_token=${TOKEN}`;

        while (url && pages < 30) {
          const res = await fetch(url);
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.error) {
            firstError = {
              status: res.status,
              code: data?.error?.code ?? null,
              subcode: data?.error?.error_subcode ?? null,
              message: sanitize(data?.error?.message || `HTTP ${res.status}`),
              type: data?.error?.type ?? null,
            };
            break;
          }
          for (const row of data?.data ?? []) {
            items.push(row);
            for (const k of Object.keys(row)) fieldSet.add(k);
            const cur = row.currency ?? row.billing_period_currency ?? null;
            if (cur) currencies.add(String(cur));
            const st = row.payment_status ?? row.status ?? null;
            if (st) statuses.add(String(st));
            if (row.download_uri || row.pdf_uri || row.invoice_uri) downloadableCount++;
            const d = row.billing_period_end || row.due_date || row.issue_date || row.created_time || null;
            if (d) {
              const dd = String(d).slice(0, 10);
              if (!minDate || dd < minDate) minDate = dd;
              if (!maxDate || dd > maxDate) maxDate = dd;
            }
          }
          url = data?.paging?.next || null;
          pages++;
        }
        if (url) paginationComplete = false;

        return {
          items_count: items.length,
          pages_loaded: pages,
          pagination_complete: paginationComplete,
          detected_fields: Array.from(fieldSet).sort(),
          currencies: Array.from(currencies),
          statuses: Array.from(statuses),
          downloadable_count: downloadableCount,
          min_date: minDate,
          max_date: maxDate,
          error: firstError,
        };
      });

      const v = invTest.value;
      let state: string;
      let note: string;
      let supported = false;
      const err = v?.error;

      if (!invTest.ok || err) {
        const code = err?.code;
        // 200 = permission error, 190 = auth, 100 with "nonexisting" = endpoint N/A
        if (code === 200 || code === 10 || err?.subcode === 2018012) {
          state = 'permission_denied';
          note = 'Business-Invoices-Endpunkt erreichbar, aber der verwendete System-User-Token besitzt nicht die erforderliche Berechtigung';
        } else if (code === 100 && /nonexist/i.test(err?.message || '')) {
          state = 'endpoint_unavailable';
          note = 'Business-Invoices-Endpunkt ist für dieses Business oder den aktuellen API-Zugriff nicht verfügbar';
        } else {
          state = 'error';
          note = err?.message || invTest.error || 'Unbekannter Fehler';
        }
      } else if ((v?.items_count ?? 0) === 0) {
        state = 'empty';
        supported = true;
        note = 'Business-Invoices-Endpunkt verfügbar, aber keine Rechnungen im abgefragten Zeitraum gefunden';
      } else {
        state = 'ok';
        supported = true;
        note = 'Business-Rechnungen verfügbar';
      }

      result.tests.invoices = {
        state,
        supported,
        note,
        runtime_ms: invTest.ms,
        endpoint: `/${BUSINESS_ID}/business_invoices`,
        start_date: startDate,
        http_status: err?.status ?? null,
        error_code: err?.code ?? null,
        error_subcode: err?.subcode ?? null,
        error_message: err?.message ?? null,
        ...(v ?? {}),
      };
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
