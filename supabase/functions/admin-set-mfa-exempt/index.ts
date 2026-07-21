// Admin-only: exempt a user from 2FA enforcement (or re-enforce).
// When exempt=true, deletes all TOTP factors of the target user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdminRow } = await admin.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (!isAdminRow) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId: string = body.target_user_id;
    const exempt: boolean = !!body.exempt;
    if (!targetUserId) return json({ error: 'target_user_id required' }, 400);
    if (targetUserId === userData.user.id) {
      return json({ error: '2FA für das eigene Konto kann nicht hier geändert werden' }, 403);
    }

    if (exempt) {
      // Remove all TOTP factors
      try {
        const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: targetUserId });
        const totp = (factors as any)?.factors?.filter((f: any) => f.factor_type === 'totp') ?? [];
        for (const f of totp) {
          await admin.auth.admin.mfa.deleteFactor({ userId: targetUserId, id: f.id });
        }
      } catch (_e) { /* non-fatal */ }
      // Clear recovery codes
      await admin.from('mfa_recovery_codes').delete().eq('user_id', targetUserId);
    }

    await admin.from('user_mfa_status').upsert({
      user_id: targetUserId,
      two_factor_exempt: exempt,
      mfa_enrolled_at: exempt ? null : undefined,
      exempt_set_by: exempt ? userData.user.id : null,
      exempt_set_at: exempt ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ ok: true, exempt });
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
