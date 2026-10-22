import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { matchSurveyDetailed, type SurveyCandidate } from '../_shared/survey-matching.ts';

const cors = { 'Access-Control-Allow-Origin': 'https://leadsharks.de', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Vary': 'Origin' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const answer = z.number().int().min(1).max(5);
const schema = z.object({ token: z.string().trim().max(256).optional(), kontaktname: z.string().trim().max(200).optional(), firma: z.string().trim().max(200).optional(), email: z.string().trim().max(254).optional(), eingegeben_firma: z.string().trim().max(200).optional(), eingegeben_email: z.string().trim().max(254).optional(), freitext: z.string().trim().max(5000).optional(), b1_reaktionszeit: answer, b2_umgang: answer, b3_verbindlichkeit: answer, b4_eigeninitiative: answer, l1_anfragemenge: answer, l2_anfragequalitaet: answer, l3_weiterempfehlung: answer });

Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
 if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
 try {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Runtime configuration missing');
  const sb = createClient(url, key);
  // The edge gateway supplies the connection IP. Never accept an IP from the request body.
  // Use the rightmost gateway-appended hop, not the caller-controlled first forwarded entry.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').map(value => value.trim()).filter(Boolean);
  const ip = forwarded?.at(-1) || req.headers.get('x-real-ip');
  if (!ip) return json({ error: 'client_ip_unavailable' }, 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key + ':' + ip));
  const ipHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  const rate = await sb.rpc('bonus_survey_rate_allow', { _ip_hash: ipHash });
  if (rate.error) throw rate.error;
  if (!rate.data) return json({ error: 'rate_limit', message: 'Maximal fünf Einsendungen pro Stunde.' }, 429);
  if (Number(req.headers.get('content-length') || 0) > 20000) return json({ error: 'payload_too_large' }, 413);
  const raw = await req.text();
  if (raw.length > 20000) return json({ error: 'payload_too_large' }, 413);
  let body: unknown; try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  // Token wins: do not even validate user-supplied identity fields in token mode.
  if (body && typeof body === 'object' && 'token' in body && typeof body.token === 'string' && body.token.trim()) {
   const { eingegeben_firma, eingegeben_email, firma, email, ...tokenBody } = body as Record<string, unknown>;
   body = tokenBody;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: 'invalid_value', fields: parsed.error.flatten().fieldErrors }, 400);
  const p = parsed.data;
  const token = p.token || null;
  const company = token ? null : (p.eingegeben_firma || p.firma || '');
  const email = token ? null : (p.eingegeben_email || p.email || '').toLowerCase();
  if (!token && (!company || !z.string().email().safeParse(email).success)) return json({ error: 'identification_required', message: 'Firma / Name und eine gültige E-Mail-Adresse sind erforderlich.' }, 400);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()).slice(0, 7) + '-01';
  let clientId: string | null = null, employeeId: string | null = null, grund: string | null = null, kandidaten: string[] = [];
  if (token) {
   const result = await sb.from('bonus_survey_tokens').select('client_id,mitarbeiter_id,monat').eq('token', token).maybeSingle();
   if (result.error) throw result.error;
   if (!result.data) return json({ error: 'token_invalid' }, 403);
   clientId = result.data.client_id; employeeId = result.data.mitarbeiter_id;
  } else {
   const all = async (table: string, select: string) => {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
     let query = sb.from(table).select(select).range(offset, offset + 999);
     if (table === 'bonus_kunden_aktuell') query = query.eq('aktiv', true);
     const result = await query;
     if (result.error) throw result.error;
     rows.push(...(result.data || [])); if ((result.data || []).length < 1000) return rows;
    }
   };
   const [active, contacts, links, clients] = await Promise.all([all('bonus_kunden_aktuell', 'client_id,mitarbeiter_id,close_lead_id'), all('close_contacts', 'client_id,close_lead_id,emails'), all('close_link', 'client_id,close_lead_id'), all('clients', 'id,name,email,vor_nachname')]);
   const ids = [...new Set(active.map(r => r.client_id).filter(Boolean))];
   const candidates: SurveyCandidate[] = ids.flatMap(id => {
    const records = active.filter(r => r.client_id === id);
    const employees = [...new Set(records.map(r => r.mitarbeiter_id))];
    if (employees.length !== 1) return [];
    const leadIds = new Set([...records.map(r => r.close_lead_id), ...links.filter(r => r.client_id === id).map(r => r.close_lead_id)]);
    const emails = contacts.filter(c => c.client_id === id || leadIds.has(c.close_lead_id)).flatMap(c => Array.isArray(c.emails) ? c.emails.map((e: any) => typeof e === 'string' ? e : e.email).filter((e: unknown) => typeof e === 'string') : []);
    const client = clients.find(c => c.id === id);
    if (typeof client?.email === 'string' && client.email.trim()) emails.push(client.email);
    return [{ client_id: id as string, mitarbeiter_id: employees[0] as string, name: client?.name || '', vor_nachname: client?.vor_nachname || null, emails }];
   });
   const match = matchSurveyDetailed(email || '', p.kontaktname || '', company || '', candidates);
   clientId = match.hit?.client_id || null; employeeId = match.hit?.mitarbeiter_id || null;
   grund = match.grund; kandidaten = match.kandidaten;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const saved = await sb.rpc('bonus_survey_save', { _payload: { ...p, token, client_id: clientId, mitarbeiter_id: employeeId, monat: month, zuordnung_grund: grund, zuordnung_kandidaten: kandidaten, eingegeben_firma: company, eingegeben_email: email, kontaktname: p.kontaktname || company || 'Token-Einsendung', score_betreuung: r1((p.b1_reaktionszeit + p.b2_umgang + p.b3_verbindlichkeit + p.b4_eigeninitiative - 4) / 16 * 100), score_leistung: r1((p.l1_anfragemenge + p.l2_anfragequalitaet + p.l3_weiterempfehlung - 3) / 12 * 100) } });
  if (saved.error) throw saved.error;
  // Do not expose customer identity or whether a supplied email exists.
  return json({ ok: true });
 } catch (e) {
  console.error('[bonus-survey-submit] failed', e instanceof Error ? e.message : 'database operation failed');
  return json({ error: 'save_failed', message: 'Einsendung konnte nicht gespeichert werden.' }, 500);
 }
});
