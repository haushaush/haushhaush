import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractLead } from "../_shared/lead-extractor.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const contentType = req.headers.get('content-type') || '';
  const userAgent = req.headers.get('user-agent') || '';

  let rawBody = '';
  let payload: Record<string, unknown> = {};

  try {
    rawBody = await req.text();

    if (contentType.includes('application/json')) {
      payload = JSON.parse(rawBody);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody);
      params.forEach((v, k) => { payload[k] = v; });
    } else if (contentType.includes('multipart/form-data')) {
      try {
        const fd = await new Request(req.url, {
          method: 'POST',
          headers: req.headers,
          body: rawBody,
        }).formData();
        fd.forEach((v, k) => { payload[k] = String(v); });
      } catch { /* ignore */ }
    } else if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        try {
          const params = new URLSearchParams(rawBody);
          params.forEach((v, k) => { payload[k] = v; });
        } catch { /* ignore */ }
      }
    }
  } catch {
    // ignore – payload stays {}
  }

  // ALWAYS log first — before any other processing
  let logEntryId: string | null = null;
  try {
    const { data: logEntry } = await admin
      .from('onepage_webhook_logs')
      .insert({
        token,
        content_type: contentType,
        payload,
        raw_body: rawBody.substring(0, 5000),
        user_agent: userAgent,
        status: 'received',
      })
      .select('id')
      .single();
    logEntryId = logEntry?.id ?? null;
  } catch (e) {
    console.error('Failed to write webhook log:', e);
  }

  const updateLog = async (status: string, error?: string, project_id?: string) => {
    if (!logEntryId) return;
    await admin
      .from('onepage_webhook_logs')
      .update({ status, error: error ?? null, project_id: project_id ?? null })
      .eq('id', logEntryId);
  };

  if (!token) {
    await updateLog('missing_token', 'No token in URL');
    return jsonResponse({ error: 'missing_token' }, 400);
  }

  // Look up project by webhook_secret
  const { data: project, error: projErr } = await admin
    .from('onepage_projects')
    .select('id, name')
    .eq('webhook_secret', token)
    .maybeSingle();

  if (projErr) {
    await updateLog('lookup_failed', projErr.message);
    return jsonResponse({ error: 'lookup_failed', detail: projErr.message }, 500);
  }

  if (!project) {
    await updateLog('unknown_token', `Token ${token.substring(0, 8)}… unbekannt`);
    return jsonResponse({ error: 'unknown_token' }, 404);
  }

  // Use shared extractor — same logic as CSV import
  const extracted = extractLead(payload);

  console.log(
    `[onepage-webhook] Extracted: email=${extracted.email} vorname=${extracted.vorname} ` +
    `nachname=${extracted.nachname} telefon=${extracted.telefon} ` +
    `from ${Object.keys(payload).length} fields`,
  );

  const lead = {
    project_id: project.id,
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
    imported_via: 'webhook',
    source: 'webhook',
    payload: {
      ...payload,
      _form_name: extracted.form_name,
    },
  };

  const { error: insertErr } = await admin
    .from('onepage_project_leads')
    .insert(lead);

  if (insertErr) {
    if (insertErr.code === '23505') {
      await updateLog('duplicate', 'Lead bereits vorhanden (Dedupe)', project.id);
      return jsonResponse({ ok: true, duplicate: true, project: project.name }, 200);
    }
    await updateLog('insert_failed', insertErr.message, project.id);
    return jsonResponse({ error: 'insert_failed', detail: insertErr.message }, 500);
  }

  await updateLog('success', undefined, project.id);
  return jsonResponse({
    ok: true,
    project: project.name,
    extracted: {
      email: extracted.email,
      vorname: extracted.vorname,
      nachname: extracted.nachname,
    },
  }, 200);
});
