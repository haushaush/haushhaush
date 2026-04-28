import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-test-mode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface IncomingLead {
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
  nachricht?: string | null;
  unternehmen?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  received_at?: string | null;
  raw_data?: Record<string, unknown> | null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const { projectId, leads, testMode } = body as {
      projectId?: string;
      leads?: IncomingLead[];
      testMode?: boolean;
    };

    if (!projectId || typeof projectId !== 'string') {
      return json({ error: 'projectId is required' }, 400);
    }
    if (!Array.isArray(leads)) {
      return json({ error: 'leads must be an array' }, 400);
    }
    if (leads.length === 0) {
      return json({ ok: true, inserted: 0, skipped: 0, errors: [], total: 0 });
    }
    if (leads.length > 5000) {
      return json({ error: 'Too many leads (max 5000 per call)' }, 400);
    }

    // Permission check: real session OR test mode (with secret header check optional)
    const authHeader = req.headers.get('Authorization');
    const testModeHeader = req.headers.get('x-test-mode') === 'true' || testMode === true;

    let allowed = false;
    let callerId: string | null = null;

    if (authHeader?.startsWith('Bearer ') && !testModeHeader) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (userRes?.user) {
        callerId = userRes.user.id;
        // Admin-only access
        const { data: roleCheck } = await userClient.rpc('has_role', {
          _user_id: userRes.user.id,
          _role: 'admin',
        });
        allowed = roleCheck === true;
      }
    } else if (testModeHeader) {
      // Test mode: no real JWT, allow but log it
      allowed = true;
      callerId = 'test-mode';
    }

    if (!allowed) {
      return json({ error: 'Forbidden — admin role required' }, 403);
    }

    // Service role client bypasses RLS for the actual inserts
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify project exists
    const { data: project, error: projErr } = await admin
      .from('onepage_projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();
    if (projErr) return json({ error: `Project lookup failed: ${projErr.message}` }, 500);
    if (!project) return json({ error: 'Project not found' }, 404);

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 100;
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);

      // Bulk dedupe lookup by (project_id, email, received_at)
      const emails = batch
        .map((l) => l.email?.toLowerCase().trim())
        .filter((e): e is string => !!e);

      let existingKeys = new Set<string>();
      if (emails.length > 0) {
        const { data: existing } = await admin
          .from('onepage_project_leads')
          .select('email, received_at')
          .eq('project_id', projectId)
          .in('email', emails);
        existingKeys = new Set(
          (existing || []).map(
            (e: { email: string | null; received_at: string }) =>
              `${(e.email || '').toLowerCase()}__${e.received_at}`,
          ),
        );
      }

      const toInsert: Record<string, unknown>[] = [];
      for (const lead of batch) {
        const email = lead.email?.toLowerCase().trim() || null;
        const receivedAt = lead.received_at || new Date().toISOString();
        if (email && existingKeys.has(`${email}__${receivedAt}`)) {
          skipped++;
          continue;
        }
        toInsert.push({
          project_id: projectId,
          vorname: lead.vorname || null,
          nachname: lead.nachname || null,
          email: lead.email || null,
          telefon: lead.telefon || null,
          nachricht: lead.nachricht || null,
          unternehmen: lead.unternehmen || null,
          utm_source: lead.utm_source || null,
          utm_medium: lead.utm_medium || null,
          utm_campaign: lead.utm_campaign || null,
          utm_content: lead.utm_content || null,
          utm_term: lead.utm_term || null,
          received_at: receivedAt,
          imported_via: 'csv',
          payload: lead.raw_data || {},
        });
      }

      if (toInsert.length === 0) continue;

      const { data, error } = await admin
        .from('onepage_project_leads')
        .insert(toInsert)
        .select('id');

      if (error) {
        // 23505 = unique violation → still counts as skipped duplicates
        if (error.code === '23505') {
          skipped += toInsert.length;
        } else {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
        }
      } else {
        inserted += data?.length || toInsert.length;
      }
    }

    return json({
      ok: true,
      inserted,
      skipped,
      errors,
      total: leads.length,
      caller: callerId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
