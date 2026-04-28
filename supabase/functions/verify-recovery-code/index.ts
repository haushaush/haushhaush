// Verify a recovery code for the authenticated user.
// On success: marks code as used, removes any TOTP factor so the user must re-enroll.
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const code: string = (body.code || '').trim().toUpperCase();
    if (!code || code.length < 4) return json({ error: 'invalid code' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = userData.user.id;
    const hash = await sha256Hex(code);

    const { data: row } = await admin
      .from('mfa_recovery_codes')
      .select('id, used_at')
      .eq('user_id', userId)
      .eq('code_hash', hash)
      .maybeSingle();

    if (!row) return json({ ok: false, error: 'invalid code' }, 400);
    if (row.used_at) return json({ ok: false, error: 'code already used' }, 400);

    // Mark used
    await admin.from('mfa_recovery_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);

    // Remove all TOTP factors so user must re-enroll
    try {
      const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
      const totpFactors = (factors as any)?.factors?.filter((f: any) => f.factor_type === 'totp') ?? [];
      for (const f of totpFactors) {
        await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
      }
    } catch (_e) {
      // Non-fatal — UI will still force re-enrollment
    }

    // Reset enrollment status
    await admin.from('user_mfa_status').upsert({
      user_id: userId,
      mfa_enrolled_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ ok: true });
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
