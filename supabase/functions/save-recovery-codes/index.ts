// Save hashed MFA recovery codes for the authenticated user.
// Stores SHA-256 hashes (single-use) — replaces any previous codes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the requesting user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
    if (codes.length === 0 || codes.length > 20) {
      return json({ error: 'invalid codes payload' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = userData.user.id;

    // Replace existing codes
    await admin.from('mfa_recovery_codes').delete().eq('user_id', userId);

    const hashes = await Promise.all(codes.map(c => sha256Hex(c.trim().toUpperCase())));
    const rows = hashes.map(h => ({ user_id: userId, code_hash: h }));
    const { error: insErr } = await admin.from('mfa_recovery_codes').insert(rows);
    if (insErr) return json({ error: insErr.message }, 500);

    // Mark enrollment timestamp
    await admin.from('user_mfa_status').upsert({
      user_id: userId,
      mfa_enrolled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ ok: true, count: codes.length });
  } catch (e: any) {
    return json({ error: e?.message || 'server error' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
