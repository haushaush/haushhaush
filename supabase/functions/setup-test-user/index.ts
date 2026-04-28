import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEST_EMAIL = 'test@haushhaush.de';
const TEST_PASSWORD = 'Test1234!';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const report: string[] = [];

    // Step 1: Find or create auth user (paginate listUsers)
    let testUser: { id: string; email?: string } | undefined;
    let page = 1;
    while (!testUser) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return jsonResponse({ ok: false, step: 'listUsers', error: error.message }, 500);
      testUser = data.users?.find((u) => u.email === TEST_EMAIL);
      if (testUser || !data.users?.length || data.users.length < 1000) break;
      page++;
    }

    if (!testUser) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Test Admin' },
      });
      if (error) return jsonResponse({ ok: false, step: 'createUser', error: error.message }, 500);
      testUser = created.user!;
      report.push(`Created auth user: ${testUser.id}`);
    } else {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(testUser.id, {
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (error) return jsonResponse({ ok: false, step: 'updateUser', error: error.message }, 500);
      report.push(`Reset password for existing user: ${testUser.id}`);
    }

    const userId = testUser!.id;

    // Step 2: Ensure team row exists with Admin role
    const teamData = {
      id: userId,
      name: 'Test Admin',
      email: TEST_EMAIL,
      rolle: 'Admin' as const,
      department: 'Management',
      position: 'Test Admin',
      portal_rolle: 'admin',
      startdatum: new Date().toISOString().split('T')[0],
      must_change_password: false,
    };

    const { error: teamErr } = await supabaseAdmin
      .from('team')
      .upsert(teamData, { onConflict: 'id' });
    if (teamErr) {
      report.push(`team upsert warn: ${teamErr.message}`);
    } else {
      report.push('Upserted team row (Admin / Management)');
    }

    // Step 3: Ensure user_roles entry = admin (this is what controls is_admin_or_manager / hasRole)
    const { error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });
    if (roleErr) {
      report.push(`user_roles upsert warn: ${roleErr.message}`);
    } else {
      report.push('Ensured user_roles: admin');
    }

    // Step 4: Ensure full permissions
    const fullPermissions = {
      user_id: userId,
      can_view_kunden: true,
      can_view_close: true,
      can_view_meta_ads: true,
      can_view_projekte: true,
      can_view_sales_kpis: true,
      can_view_fulfillment: true,
      can_view_finanzen: true,
      can_view_team_hr: true,
      can_manage_settings: true,
    };
    const { error: permErr } = await supabaseAdmin
      .from('user_permissions')
      .upsert(fullPermissions, { onConflict: 'user_id' });
    if (permErr) {
      report.push(`user_permissions upsert warn: ${permErr.message}`);
    } else {
      report.push('Upserted full admin permissions');
    }

    // Step 5: Disable any MFA factors so dev login is friction-free
    try {
      const { data: factorsData } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
      const factors = (factorsData as any)?.factors ?? [];
      for (const f of factors) {
        await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
        report.push(`Removed MFA factor: ${f.id}`);
      }
    } catch (e) {
      report.push(`MFA cleanup skipped: ${(e as Error).message}`);
    }

    // Reset MFA enrollment status row so MfaGate doesn't force a challenge
    try {
      await supabaseAdmin.from('user_mfa_status').upsert({
        user_id: userId,
        mfa_enrolled_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      await supabaseAdmin.from('mfa_recovery_codes').delete().eq('user_id', userId);
      await supabaseAdmin.from('mfa_trusted_devices').delete().eq('user_id', userId);
    } catch {
      // tables may not exist in older envs — ignore
    }

    return jsonResponse({
      ok: true,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      user_id: userId,
      report,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: (e as Error).message }, 500);
  }
});
