// google-oauth-start
// Builds the Google OAuth consent URL for the currently authenticated user
// and stores a one-time state token (with the user_id) in oauth_states.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;
const SCOPE = 'https://www.googleapis.com/auth/drive email profile';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // Find Google OAuth client_id from any user's stored google_drive integration_settings
    // (the admin who configured the credentials).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: settings, error: settingsError } = await admin
      .from('integration_settings')
      .select('config')
      .eq('provider', 'google_drive')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (settingsError) {
      return new Response(JSON.stringify({ error: 'Failed to read integration settings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = (settings?.[0]?.config as Record<string, unknown> | undefined)?.client_id as string | undefined;
    if (!clientId) {
      return new Response(
        JSON.stringify({
          error:
            'Keine Google Client ID in den Integrationen hinterlegt. Bitte zuerst Client ID & Secret in Einstellungen → Google Drive eintragen.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Generate state token and persist it
    const state = crypto.randomUUID() + '.' + crypto.randomUUID();
    const { error: stateError } = await admin.from('oauth_states').insert({
      state,
      user_id: userId,
      provider: 'google_drive',
    });
    if (stateError) {
      return new Response(JSON.stringify({ error: 'Failed to create OAuth state' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cleanup expired states (best-effort, ignore errors)
    admin.from('oauth_states').delete().lt('expires_at', new Date().toISOString()).then(() => {});

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      include_granted_scopes: 'true',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(JSON.stringify({ authUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-oauth-start error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
