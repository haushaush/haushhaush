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

const MAX_LEADS = 5000; // safety cap
const MAX_FORMS = 500;
const PAGE_SIZE = 200;
const HARD_TIMEOUT_MS = 55_000;

type DatePreset = 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

async function metaFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}${path.startsWith('/') ? path : '/' + path}`);
  url.searchParams.set('access_token', ACCESS_TOKEN!);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data?.error) {
    const err = data?.error?.message || `Meta API error (${res.status})`;
    const code = data?.error?.code;
    const sub = data?.error?.error_subcode;
    throw new Error(`${err}${code ? ` [code=${code}${sub ? `/${sub}` : ''}]` : ''}`);
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
      data = await metaFetch(path, { ...params, limit: String(PAGE_SIZE) });
      first = false;
    } else {
      const res = await fetch(nextUrl!);
      data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error?.message || `Meta API error (${res.status})`);
    }
    if (Array.isArray(data?.data)) all.push(...data.data);
    nextUrl = data?.paging?.next || null;
    if (!nextUrl) break;
  }
  return all.slice(0, cap);
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
  // Normalize common aliases
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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

    // Permission check: admin OR sales.meta.view
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

    if (!meta_account_id) return json({ error: 'meta_account_id is required' }, 400);
    const acctPath = meta_account_id.startsWith('act_') ? meta_account_id : `act_${meta_account_id}`;

    const deadline = Date.now() + HARD_TIMEOUT_MS;
    const period = resolvePeriod(date_preset, date_from, date_to);

    // Validate account + fetch name
    let accountName = '';
    try {
      const acct = await metaFetch(`/${acctPath}`, { fields: 'name,account_status' });
      accountName = acct?.name || '';
    } catch (e) {
      return json({ error: `Werbekonto konnte nicht validiert werden: ${(e as Error).message}` }, 400);
    }

    // Fetch lead forms for this account
    let forms: any[] = [];
    try {
      forms = await fetchAllPaged(`/${acctPath}/leadgen_forms`, { fields: 'id,name,status' }, MAX_FORMS, deadline);
    } catch (e) {
      const msg = (e as Error).message;
      if (/permission|scope|lead|leads_retrieval/i.test(msg)) {
        return json({ error: 'Meta Leads können nicht abgerufen werden. Bitte Lead-Zugriff/Rechte der Meta-Verknüpfung prüfen.', detail: msg }, 403);
      }
      return json({ error: 'Lead-Formulare konnten nicht geladen werden.', detail: msg }, 502);
    }

    if (forms.length === 0) {
      return json({
        success: true,
        meta_account_id: acctPath,
        meta_account_name: accountName,
        period: { from: period.from, to: period.to, preset: date_preset },
        count: 0,
        leads: [],
        warning: 'Für dieses Werbekonto wurden keine Lead-Formulare gefunden.',
      });
    }

    // Time filter for /{form_id}/leads: filtering=[{field:"time_created",operator:"GREATER_THAN",value:<unix>}]
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
    let truncated = false;
    let firstError: string | null = null;

    for (const form of forms) {
      if (Date.now() > deadline) { truncated = true; break; }
      if (allLeads.length >= MAX_LEADS) { truncated = true; break; }
      const remaining = MAX_LEADS - allLeads.length;
      try {
        const leads = await fetchAllPaged(`/${form.id}/leads`, commonParams, remaining, deadline);
        for (const l of leads) {
          const fields = extractFields(l.field_data || []);
          allLeads.push({
            lead_id: l.id,
            created_time: l.created_time,
            form_id: form.id,
            form_name: form.name || '',
            campaign_name: l.campaign_name || '',
            ad_name: l.ad_name || '',
            meta_account_id: acctPath,
            meta_account_name: accountName,
            fields,
            raw: l,
          });
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (!firstError) firstError = `Form ${form.name || form.id}: ${msg}`;
        // Continue with other forms
      }
    }

    return json({
      success: true,
      meta_account_id: acctPath,
      meta_account_name: accountName,
      period: { from: period.from, to: period.to, preset: date_preset },
      count: allLeads.length,
      leads: allLeads,
      truncated,
      forms_count: forms.length,
      warning: allLeads.length === 0 ? 'Keine Leads für diesen Zeitraum gefunden.' : (truncated ? `Nur die ersten ${allLeads.length} Leads wurden geladen. Bitte Zeitraum einschränken.` : undefined),
      error_hint: firstError,
    });
  } catch (err) {
    console.error('export-meta-leads error:', err);
    return json({ error: (err as Error).message || 'Unknown error' }, 500);
  }
});
