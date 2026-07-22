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

const MAX_LEADS_DEFAULT = 10_000;
const MAX_LEADS_ALLTIME = 10_000;
const PAGE_SIZE = 100;
const HARD_TIMEOUT_MS = 55_000;

type DatePreset = 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

class RateLimitError extends Error {
  detail: string;
  constructor(detail: string) { super('meta_rate_limit'); this.detail = detail; }
}
class MetaApiError extends Error {
  code?: number; subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message); this.code = code; this.subcode = subcode;
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
  const d = (offset: number) => { const x = new Date(today); x.setUTCDate(x.getUTCDate() + offset); return x; };
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

async function metaFetch(path: string, params: Record<string, string>, attempt = 0, accessToken = ACCESS_TOKEN!): Promise<any> {
  const url = new URL(`${BASE}${path.startsWith('/') ? path : '/' + path}`);
  url.searchParams.set('access_token', accessToken);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const errObj = data?.error || { message: `Meta API error (${res.status})` };
    if (isRateLimit(errObj)) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); return metaFetch(path, params, attempt + 1, accessToken); }
      throw new RateLimitError(errObj?.message || 'User request limit reached');
    }
    throw new MetaApiError(
      errObj?.message || 'Meta API error',
      typeof errObj?.code === 'number' ? errObj.code : undefined,
      typeof errObj?.error_subcode === 'number' ? errObj.error_subcode : undefined,
    );
  }
  return data;
}

async function fetchPagingUrl(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const errObj = data?.error || { message: `Meta API error (${res.status})` };
    if (isRateLimit(errObj)) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); return fetchPagingUrl(url, attempt + 1); }
      throw new RateLimitError(errObj?.message || 'User request limit reached');
    }
    throw new MetaApiError(
      errObj?.message || `Meta API error (${res.status})`,
      typeof errObj?.code === 'number' ? errObj.code : undefined,
      typeof errObj?.error_subcode === 'number' ? errObj.error_subcode : undefined,
    );
  }
  return data;
}

async function fetchAllPaged(path: string, params: Record<string, string>, cap: number, deadline: number, accessToken = ACCESS_TOKEN!) {
  const all: any[] = [];
  let nextUrl: string | null = null;
  let first = true;
  let pageCount = 0;
  while (all.length < cap) {
    if (Date.now() > deadline) break;
    let data: any;
    if (first) {
      data = await metaFetch(path, { ...params, limit: String(Math.min(PAGE_SIZE, cap)) }, 0, accessToken);
      first = false;
    } else {
      await new Promise((r) => setTimeout(r, 200));
      data = await fetchPagingUrl(nextUrl!);
    }
    pageCount++;
    if (Array.isArray(data?.data)) all.push(...data.data);
    nextUrl = data?.paging?.next || null;
    if (!nextUrl) break;
  }
  return { items: all.slice(0, cap), hasMore: all.length > cap || !!nextUrl, pageCount };
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
    for (const s of sources) if (out[s]) { out[target] = out[s]; return; }
  };
  alias('full_name', ['full_name', 'name', 'first_name_last_name', 'vollständiger_name', 'vollstandiger_name']);
  alias('email', ['email', 'e_mail', 'email_address']);
  alias('phone', ['phone_number', 'phone', 'telefon', 'telefonnummer', 'mobile_number']);
  alias('city', ['city', 'stadt', 'ort']);
  alias('zip', ['zip_code', 'zip', 'postal_code', 'plz', 'postleitzahl']);
  return out;
}

function rateLimitResponse(detail: string, step: string) {
  return json({
    success: false, error: 'meta_rate_limit',
    message: 'Meta API Limit erreicht. Bitte warte ein paar Minuten und versuche es erneut.',
    detail, retry_after_seconds: 300, step,
  }, 429);
}

function metaErrorDetail(error: unknown): string {
  if (!(error instanceof MetaApiError)) return (error as Error)?.message || 'Unbekannter Meta API Fehler';
  const suffix = error.code ? ` [code=${error.code}${error.subcode ? `/${error.subcode}` : ''}]` : '';
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

// Extract lead_gen_form_id defensively from creative.object_story_spec
function extractFormIdsFromCreative(creative: any): string[] {
  const ids: string[] = [];
  const oss = creative?.object_story_spec;
  if (!oss) return ids;
  const buckets = [oss.link_data, oss.video_data, oss.template_data];
  for (const b of buckets) {
    const v = b?.call_to_action?.value?.lead_gen_form_id;
    if (v) ids.push(String(v));
  }
  return ids;
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
    if (!isAdmin && !hasPerm) return json({ error: 'Du hast keine Berechtigung, Meta Leads zu exportieren.' }, 403);

    const body = await req.json().catch(() => ({}));
    const meta_account_id: string = (body?.meta_account_id || '').trim();
    const date_preset: DatePreset = (body?.date_preset || 'last_7_days') as DatePreset;
    const date_from: string | undefined = body?.date_from;
    const date_to: string | undefined = body?.date_to;
    const confirm_all_time: boolean = !!body?.confirm_all_time;

    if (!meta_account_id) return json({ error: 'meta_account_id is required' }, 400);
    const acctPath = meta_account_id.startsWith('act_') ? meta_account_id : `act_${meta_account_id}`;

    if (date_preset === 'all_time' && !confirm_all_time) {
      return json({ success: false, error: 'confirm_required', message: 'Dieser Export kann viele Meta API Calls verursachen. Fortfahren?' }, 200);
    }

    const deadline = Date.now() + HARD_TIMEOUT_MS;
    const period = resolvePeriod(date_preset, date_from, date_to);
    const cap = date_preset === 'all_time' ? MAX_LEADS_ALLTIME : MAX_LEADS_DEFAULT;

    Object.assign(logCtx, { meta_account_id: acctPath, date_from: period.from, date_to: period.to, preset: date_preset });

    // account name
    let accountName = '';
    try {
      const acct = await metaFetch(`/${acctPath}`, { fields: 'name' });
      accountName = acct?.name || '';
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'account');
    }

    // --- Source A: Pages -> leadgen_forms
    logCtx.step = 'pages';
    let pages: Array<{ id: string; name: string }> = [];
    try {
      const r = await fetchAllPaged(`/${acctPath}/promote_pages`, { fields: 'id,name' }, 500, deadline);
      pages = r.items.filter((p: any) => p?.id).map((p: any) => ({ id: String(p.id), name: String(p.name || '') }));
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'pages');
      logMetaError('[export-meta-leads] pages error', logCtx, e);
    }

    type FormMeta = { id: string; name: string; page_id: string; page_name: string; page_access_token: string | null; sources: Set<string> };
    const formsById = new Map<string, FormMeta>();
    let formsWarning: string | null = null;

    // page tokens map for later leads fetching
    const pageTokens = new Map<string, string>();

    logCtx.step = 'forms_from_pages';
    for (const page of pages) {
      if (Date.now() > deadline) { formsWarning = 'Zeitlimit beim Laden der Lead-Formulare erreicht.'; break; }
      try {
        const pageTokenResult = await metaFetch(`/${page.id}`, { fields: 'access_token' });
        const pageAccessToken = typeof pageTokenResult?.access_token === 'string' ? pageTokenResult.access_token : null;
        if (pageAccessToken) pageTokens.set(page.id, pageAccessToken);
        if (!pageAccessToken) throw new MetaApiError('Kein Page Access Token', 190);
        const r = await fetchAllPaged(`/${page.id}/leadgen_forms`, { fields: 'id,name,status' }, 1000, deadline, pageAccessToken);
        for (const form of r.items) {
          if (!form?.id) continue;
          const key = String(form.id);
          const existing = formsById.get(key);
          if (existing) { existing.sources.add('page_leadgen_forms'); continue; }
          formsById.set(key, {
            id: key, name: String(form.name || ''),
            page_id: page.id, page_name: page.name, page_access_token: pageAccessToken,
            sources: new Set(['page_leadgen_forms']),
          });
        }
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'forms');
        const detail = metaErrorDetail(e);
        logMetaError('[export-meta-leads] page forms error', { ...logCtx, page_id: page.id }, e);
        if (!formsWarning) formsWarning = `Seite ${page.name || page.id}: ${detail}`;
      }
    }
    const formIdsFromPages = formsById.size;

    // --- Source B: Ads/Creatives -> object_story_spec.*.call_to_action.value.lead_gen_form_id
    logCtx.step = 'ads_scan';
    let adsChecked = 0;
    let formIdsFromAdsOnly = 0;
    try {
      const adFields = 'id,name,campaign{id,name},creative{id,name,object_story_spec}';
      const adsRes = await fetchAllPaged(`/${acctPath}/ads`, { fields: adFields }, 2000, deadline);
      adsChecked = adsRes.items.length;
      for (const ad of adsRes.items) {
        const ids = extractFormIdsFromCreative(ad?.creative);
        for (const fid of ids) {
          const existing = formsById.get(fid);
          if (existing) { existing.sources.add('ad_creative'); continue; }
          formIdsFromAdsOnly++;
          formsById.set(fid, {
            id: fid, name: '', page_id: '', page_name: '',
            page_access_token: null, sources: new Set(['ad_creative']),
          });
        }
      }
    } catch (e) {
      if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'ads_scan');
      logMetaError('[export-meta-leads] ads scan error', logCtx, e);
    }

    // For forms discovered only via ads, try to enrich with page + token
    logCtx.step = 'forms_enrich';
    for (const form of formsById.values()) {
      if (form.page_access_token) continue;
      if (Date.now() > deadline) break;
      try {
        const info = await metaFetch(`/${form.id}`, { fields: 'id,name,page{id,name}' });
        form.name = form.name || String(info?.name || '');
        const pageId = info?.page?.id ? String(info.page.id) : '';
        const pageName = info?.page?.name ? String(info.page.name) : '';
        if (pageId) {
          form.page_id = pageId;
          form.page_name = pageName;
          let tok = pageTokens.get(pageId) || null;
          if (!tok) {
            try {
              const tokRes = await metaFetch(`/${pageId}`, { fields: 'access_token' });
              tok = typeof tokRes?.access_token === 'string' ? tokRes.access_token : null;
              if (tok) pageTokens.set(pageId, tok);
            } catch { /* ignore */ }
          }
          form.page_access_token = tok;
        }
      } catch (e) {
        if (e instanceof RateLimitError) return rateLimitResponse(e.detail, 'forms_enrich');
        // form probably not accessible; keep it, we'll error per form
      }
    }

    const forms = Array.from(formsById.values());

    // --- Step: paginated leads per form
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
    let hasMore = false;
    let firstError: string | null = null;
    let lead_pages_requested = 0;
    let raw_leads_before_filter = 0;
    let dedupe_removed = 0;
    let forms_with_leads = 0;
    let earliest: string | null = null;
    let latest: string | null = null;

    const formDebug: Array<{ form_id: string; form_name: string; page_id: string; source: string; raw_leads: number; leads_after_date_filter: number; error: string | null }> = [];

    for (const form of forms) {
      const debugRow = {
        form_id: form.id, form_name: form.name, page_id: form.page_id,
        source: Array.from(form.sources).join(','),
        raw_leads: 0, leads_after_date_filter: 0, error: null as string | null,
      };
      if (Date.now() > deadline) { hasMore = true; debugRow.error = 'timeout'; formDebug.push(debugRow); break; }
      if (allLeads.length >= cap) { hasMore = true; debugRow.error = 'cap_reached'; formDebug.push(debugRow); break; }
      if (!form.page_access_token) { debugRow.error = 'no_page_access_token'; formDebug.push(debugRow); continue; }
      const remaining = cap - allLeads.length;
      try {
        const r = await fetchAllPaged(`/${form.id}/leads`, commonParams, remaining, deadline, form.page_access_token);
        lead_pages_requested += r.pageCount;
        debugRow.raw_leads = r.items.length;
        raw_leads_before_filter += r.items.length;
        let added = 0;
        for (const l of r.items) {
          if (!l?.id) continue;
          if (seenLeadIds.has(l.id)) { dedupe_removed++; continue; }
          seenLeadIds.add(l.id);
          const fields = extractFields(l.field_data || []);
          allLeads.push({
            lead_id: l.id, created_time: l.created_time,
            form_id: l.form_id || form.id, form_name: form.name,
            page_id: form.page_id, page_name: form.page_name,
            campaign_name: l.campaign_name || '', ad_id: l.ad_id || '', ad_name: l.ad_name || '',
            meta_account_id: acctPath, meta_account_name: accountName,
            fields, raw: l,
          });
          added++;
          if (l.created_time) {
            if (!earliest || l.created_time < earliest) earliest = l.created_time;
            if (!latest || l.created_time > latest) latest = l.created_time;
          }
        }
        debugRow.leads_after_date_filter = added;
        if (added > 0) forms_with_leads++;
        if (r.hasMore) hasMore = true;
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        if (e instanceof RateLimitError) {
          debugRow.error = 'rate_limit';
          formDebug.push(debugRow);
          if (allLeads.length === 0) return rateLimitResponse(e.detail, 'leads');
          hasMore = true;
          firstError = 'Meta API Limit erreicht – Ergebnis ist unvollständig.';
          break;
        }
        const detail = metaErrorDetail(e);
        debugRow.error = detail;
        logMetaError('[export-meta-leads] leads error', { ...logCtx, form_id: form.id }, e);
        if (!firstError) firstError = `Formular ${form.name || form.id}: ${detail}`;
      }
      formDebug.push(debugRow);
    }

    // --- Insights: count of form-only leads (excluding website/pixel leads)
    logCtx.step = 'insights';
    let insights_form_leads: number | null = null;
    try {
      const insightsParams: Record<string, string> = {
        level: 'ad',
        fields: 'ad_id,actions',
        limit: '500',
      };
      if (period.from && period.to) {
        insightsParams.time_range = JSON.stringify({ since: period.from, until: period.to });
      } else if (date_preset !== 'custom' && date_preset !== 'all_time') {
        const presetMap: Record<string, string> = {
          last_7_days: 'last_7d', last_30_days: 'last_30d',
          this_month: 'this_month', last_month: 'last_month',
        };
        insightsParams.date_preset = presetMap[date_preset] || 'last_7d';
      } else if (date_preset === 'all_time') {
        insightsParams.date_preset = 'maximum';
      }
      const insRes = await fetchAllPaged(`/${acctPath}/insights`, insightsParams, 5000, deadline);
      let total = 0;
      for (const row of insRes.items) {
        const actions = Array.isArray(row?.actions) ? row.actions : [];
        const map: Record<string, number> = {};
        for (const a of actions) map[a.action_type] = Number(a.value || 0);
        // Priority: lead > onsite_conversion.lead_grouped > onsite_conversion.lead
        const v = map['lead'] ?? map['onsite_conversion.lead_grouped'] ?? map['onsite_conversion.lead'] ?? 0;
        total += v;
      }
      insights_form_leads = total;
    } catch (e) {
      if (e instanceof RateLimitError) {
        // Skip insights if rate limited but keep leads result
      } else {
        logMetaError('[export-meta-leads] insights error', logCtx, e);
      }
    }

    const debug = {
      meta_account_id: acctPath,
      meta_account_name: accountName,
      date_from: period.from,
      date_to: period.to,
      pages_checked: pages.length,
      forms_found: forms.length,
      forms_with_leads,
      forms_without_leads: forms.length - forms_with_leads,
      lead_pages_requested,
      raw_leads_before_filter,
      leads_after_date_filter: allLeads.length,
      leads_after_dedupe: allLeads.length,
      deduped_removed: dedupe_removed,
      ads_checked_for_form_ids: adsChecked,
      form_ids_from_pages: formIdsFromPages,
      form_ids_from_ads: formIdsFromAdsOnly,
      unique_form_ids_total: forms.length,
      earliest_lead_created_time: earliest,
      latest_lead_created_time: latest,
    };

    return json({
      success: true,
      meta_account_id: acctPath,
      meta_account_name: accountName,
      period: { from: period.from, to: period.to, preset: date_preset },
      count: allLeads.length,
      leads: allLeads,
      has_more: hasMore,
      partial: hasMore,
      pages_count: pages.length,
      forms_count: forms.length,
      insights_form_leads,
      debug,
      form_debug: formDebug,
      warning: allLeads.length === 0
        ? 'Keine Leads für diesen Zeitraum gefunden.'
        : (hasMore ? `Nur die ersten ${allLeads.length} Leads wurden geladen. Bitte Zeitraum einschränken.` : undefined),
      error_hint: firstError || formsWarning,
    });
  } catch (err) {
    console.error('[export-meta-leads] unhandled', logCtx, err);
    if (err instanceof RateLimitError) return rateLimitResponse(err.detail, logCtx.step || 'unknown');
    return json({ error: (err as Error).message || 'Unknown error' }, 500);
  }
});
