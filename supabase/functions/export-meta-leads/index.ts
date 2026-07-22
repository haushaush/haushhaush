// Export Meta Lead Ads leads for a given ad account + period.
// Auth: authenticated user with admin role OR sales.meta.view permission.
// Uses server-side META_ACCESS_TOKEN. Never exposes token to client.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const API_VERSION = 'v19.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

const MAX_LEADS_DEFAULT = 1000;
const MAX_LEADS_ALLTIME = 5000;
const PAGE_SIZE = 100;
const HARD_TIMEOUT_MS = 50_000;

type DatePreset = 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class RateLimitError extends Error {
  detail: string;
  constructor(detail: string) {
    super('meta_rate_limit');
    this.detail = detail;
  }
}

class MetaApiError extends Error {
  code?: number;
  subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.code = code;
    this.subcode = subcode;
  }
}

function isRateLimit(err: any): boolean {
  const code = err?.code;
  const sub = err?.error_subcode;
  const msg = String(err?.message || '');
  if (code === 17 || code === 4 || code === 32 || code === 613) return true;
  if (sub === 2446079) return true;
  if (/user request limit reached|rate limit|too many|throttl/i.test(msg)) return true;
  return false;
}

function resolvePeriod(preset: DatePreset, from?: string, to?: string): { from: string | null; to: string | null } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const d = (offset: number) => {
    const x = new Date(today);
    x.setUTCDate(x.getUTCDate() + offset);
    return x;
  };
  switch (preset) {
    case 'last_7_days': return { from: iso(d(-7)), to: iso(today) };
    case 'last_30_days': return { from: iso(d(-30)), to: iso(today) };
    case 'this_month': {
      const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { from: iso(s), to: iso(today) };
    }
    case 'last_month': {
      const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: iso(s), to: iso(e) };
    }
    case 'all_time': return { from: null, to: null };
    case 'custom': return { from: from || null, to: to || null };
    default: return { from: null, to: null };
  }
}

async function metaFetch(path: string, params: Record<string, string>, attempt = 0): Promise<any> {
  const url = new URL(`${BASE}${path.startsWith('/') ? path : '/' + path}`);
  url.searchParams.set('access_token', ACCESS_TOKEN!);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const errObj = data?.error || { message: `Meta API error (${res.status})` };
    if (isRateLimit(errObj)) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return metaFetch(path, params, attempt + 1);
      }
      throw new RateLimitError(errObj?.message || 'User request limit reached');
    }
    const code = typeof errObj?.code === 'number' ? errObj.code : undefined;
    const sub = typeof errObj?.error_subcode === 'number' ? errObj.error_subcode : undefined;
    throw new MetaApiError(errObj?.message || 'Meta API error', code, sub);
  }
  return data;
}

async function fetchAllPaged(path: string, params: Record<string, string>, cap: number, deadline: number) {
  const all: any[] = [];
  let nextUrl: string | null = null;
  let first = true;
  while (all.length < cap) {
    if (Date.now() > deadline) break;
    let data: any;
    if (first) {
      data = await metaFetch(path, { ...params, limit: String(Math.min(PAGE_SIZE, cap)) });
      first = false;
    } else {
      const res = await fetch(nextUrl!);
      data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        if (isRateLimit(data?.error)) throw new RateLimitError(data?.error?.message || 'User request limit reached');
        const apiError = data?.error;
        throw new MetaApiError(
          apiError?.message || `Meta API error (${res.status})`,
          typeof apiError?.code === 'number' ? apiError.code : undefined,
          typeof apiError?.error_subcode === 'number' ? apiError.error_subcode : undefined,
        );
      }
    }
    if (Array.isArray(data?.data)) all.push(...data.data);
    nextUrl = data?.paging?.next || null;
    if (!nextUrl) break;
  }
  return { items: all.slice(0, cap), hasMore: all.length > cap || !!nextUrl };
}

function normalizeFieldName(name: string): string {
  return (name || '').toLowerCase().trim().replace(/\s+/g, '_');
}

function extractFields(fieldData: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(fieldData)) return out;
  for (const f of fieldData) {
    const key = normalizeFieldName(f?.name || '');
    if (!key) continue;
    const val = Array.isArray(f?.values) ? f.values.join(', ') : (f?.values ?? '');
    out[key] = String(val ?? '');
  }
  const alias = (target: string, sources: string[]) => {
    if (out[target]) return;
    for (const s of sources) {
      if (out[s]) { out[target] = out[s]; return; }
    }
  };
  alias('full_name', ['full_name', 'name', 'first_name_last_name', 'vollständiger_name', 'vollstandiger_name']);
  alias('email', ['email', 'e_mail', 'email_address']);
  alias('phone', ['phone_number', 'phone', 'telefon', 'telefonnummer', 'mobile_number']);
  alias('city', ['city', 'stadt', 'ort']);
  alias('zip', ['zip_code', 'zip', 'postal_code', 'plz', 'postleitzahl']);
  return out;
}

function rateLimitResponse(detail: string, step: string) {
  console.warn(`[export-meta-leads] rate_limited step=${step} detail=${detail}`);
  return json({
    success: false,
    error: 'meta_rate_limit',
    message: 'Meta API Limit erreicht. Bitte warte ein paar Minuten und versuche es erneut.',
    detail,
    retry_after_seconds: 300,
    step,
  }, 429);
}

function metaErrorDetail(error: unknown): string {
  if (!(error instanceof MetaApiError)) return (error as Error)?.message || 'Unbekannter Meta API Fehler';
  const suffix = error.code
    ? ` [code=${error.code}${error.subcode ? `/${error.subcode}` : ''}]`
    : '';
  return `${error.message}${suffix}`;
}

function logMetaError(prefix: string, context: Record<string, unknown>, error: unknown) {
  const apiError = error instanceof MetaApiError ? error : null;
  console.error(prefix, {
    ...context,
    meta_error_code: apiError?.code ?? null,
    meta_error_subcode: apiError?.subcode ?? null,
    message: apiError?.message || (error as Error)?.message || 'Unknown error',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logCtx: any = { step: 'init' };

  try {
    if (!ACCESS_TOKEN) return json({ error: 'META_ACCESS_TOKEN not configured' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const [{ data: isAdmin }, { data: hasPerm }] = await Promise.all([
      supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
      supabase.rpc('user_has_permission', { target_user_id: userId, requested_permission_key: 'sales.meta.view' }),
    ]);
    if (!isAdmin && !hasPerm) {
      return json({ error: 'Du hast keine Berechtigung, Meta Leads zu exportieren.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const meta_account_id: string = (body?.meta_account_id || '').trim();
    const date_preset: DatePreset = (body?.date_preset || 'last_7_days') as DatePreset;
    const date_from: string | undefined = body?.date_from;
    const date_to: string | undefined = body?.date_to;
    const confirm_all_time: boolean = !!body?.confirm_all_time;

    if (!meta_account_id) return json({ error: 'meta_account_id is required' }, 400);
    const acctPath = meta_account_id.startsWith('act_') ? meta_account_id : `act_${meta_account_id}`;

    if (date_preset === 'all_time' && !confirm_all_time) {
      return json({
        success: false,
        error: 'confirm_required',
        message: 'Dieser Export kann viele Meta API Calls verursachen. Fortfahren?',
      }, 200);
    }

    const deadline = Date.now() + HARD_TIMEOUT_MS;
    const period = resolvePeriod(date_preset, date_from, date_to);
    const cap = date_preset === 'all_time' ? MAX_LEADS_ALLTIME : MAX_LEADS_DEFAULT;

    Object.assign(logCtx, { meta_account_id: acctPath, date_from: period.from, date_to: period.to, preset: date_preset });

    // leadgen_forms belongs to Page nodes, not AdAccount nodes. Fetch ads once,
    // then query only ads that belong to lead-generation campaigns.
    logCtx.step = 'ads';
    let ads: any[] = [];
    let adsTruncated = false;
    try {
      const r = await fetchAllPaged(
        `/${acctPath}/ads`,
        { fields: 'id,name,campaign{id,name,objective}' },
        2000,
        deadline,
      );
      ads = r.items.filter((ad) => {
        const objective = String(ad?.campaign?.objective || '').toUpperCase();
        return objective === 'LEAD_GENERATION' || objective === 'OUTCOME_LEADS';
      });
      adsTruncated = r.hasMore;
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'ads');
      const detail = metaErrorDetail(e);
      logMetaError('[export-meta-leads] ads error', logCtx, e);
      if (/permission|scope|access|lead/i.test(detail) || (e instanceof MetaApiError && [10, 200, 278].includes(e.code || 0))) {
        return json({
          success: false,
          error: 'meta_permissions',
          message: 'Meta Leads können nicht abgerufen werden. Bitte Lead-Zugriff/Rechte prüfen.',
          detail,
          step: 'ads',
        });
      }
      return json({
        success: false,
        error: 'meta_api_error',
        message: 'Anzeigen konnten nicht geladen werden.',
        detail,
        step: 'ads',
      });
    }

    let accountName = '';
    try {
      const acct = await metaFetch(`/${acctPath}`, { fields: 'name' });
      accountName = acct?.name || '';
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'account');
      // non-fatal
    }

    if (ads.length === 0) {
      return json({
        success: true,
        meta_account_id: acctPath,
        meta_account_name: accountName,
        period: { from: period.from, to: period.to, preset: date_preset },
        count: 0,
        leads: [],
        warning: 'Für dieses Werbekonto wurden keine Lead-Anzeigen gefunden.',
      });
    }

    // Step 2: leads per lead ad with time filter. Lead IDs are deduplicated because
    // Meta can expose the same lead through more than one related object.
    logCtx.step = 'leads';
    const filters: any[] = [];
    if (period.from) {
      const ts = Math.floor(new Date(period.from + 'T00:00:00Z').getTime() / 1000);
      filters.push({ field: 'time_created', operator: 'GREATER_THAN', value: ts - 1 });
    }
    if (period.to) {
      const ts = Math.floor(new Date(period.to + 'T23:59:59Z').getTime() / 1000);
      filters.push({ field: 'time_created', operator: 'LESS_THAN', value: ts + 1 });
    }
    const leadFields = 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,platform,is_organic';
    const commonParams: Record<string, string> = { fields: leadFields };
    if (filters.length) commonParams.filtering = JSON.stringify(filters);

    const allLeads: any[] = [];
    const seenLeadIds = new Set<string>();
    let hasMore = adsTruncated;
    let firstError: string | null = null;

    for (const ad of ads) {
      if (Date.now() > deadline) { hasMore = true; break; }
      if (allLeads.length >= cap) { hasMore = true; break; }
      const remaining = cap - allLeads.length;
      try {
        const r = await fetchAllPaged(`/${ad.id}/leads`, commonParams, remaining, deadline);
        if (r.hasMore) hasMore = true;
        for (const l of r.items) {
          if (!l?.id || seenLeadIds.has(l.id)) continue;
          seenLeadIds.add(l.id);
          const fields = extractFields(l.field_data || []);
          allLeads.push({
            lead_id: l.id,
            created_time: l.created_time,
            form_id: l.form_id || '',
            form_name: '',
            campaign_name: l.campaign_name || ad?.campaign?.name || '',
            ad_name: l.ad_name || ad?.name || '',
            meta_account_id: acctPath,
            meta_account_name: accountName,
            fields,
            raw: l,
          });
        }
      } catch (e) {
        if (e instanceof RateLimitError) {
          if (allLeads.length === 0) return rateLimitResponse(e.detail, 'leads');
          // partial data — return what we have with a warning
          hasMore = true;
          firstError = 'Meta API Limit erreicht – Ergebnis ist unvollständig.';
          break;
        }
        const detail = metaErrorDetail(e);
        logMetaError('[export-meta-leads] leads error', { ...logCtx, ad_id: ad.id }, e);
        if (!firstError) firstError = `Anzeige ${ad.name || ad.id}: ${detail}`;
      }
    }

    return json({
      success: true,
      meta_account_id: acctPath,
      meta_account_name: accountName,
      period: { from: period.from, to: period.to, preset: date_preset },
      count: allLeads.length,
      leads: allLeads,
      has_more: hasMore,
      partial: hasMore,
      ads_count: ads.length,
      warning: allLeads.length === 0
        ? 'Keine Leads für diesen Zeitraum gefunden.'
        : (hasMore ? `Nur die ersten ${allLeads.length} Leads wurden geladen. Bitte Zeitraum einschränken.` : undefined),
      error_hint: firstError,
    });
  } catch (err) {
    console.error('[export-meta-leads] unhandled', logCtx, err);
    if (err instanceof RateLimitError) return rateLimitResponse(err.detail, logCtx.step || 'unknown');
    return json({ error: (err as Error).message || 'Unknown error' }, 500);
  }
});
