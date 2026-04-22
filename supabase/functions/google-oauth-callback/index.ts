// google-oauth-callback
// Public endpoint Google redirects to after consent.
// Validates the state token, exchanges code for tokens, fetches user info,
// upserts a row in google_drive_connections, then redirects back to the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;

// Returned-to-the-browser app URL. Prefer Origin/Referer header from the original
// redirect; fall back to a configured APP_URL secret, then to the live host.
const FALLBACK_APP_URL = Deno.env.get('APP_URL') ?? 'https://haushhaush.lovable.app';

function htmlRedirect(url: string, message: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Verbinde…</title>
     <meta http-equiv="refresh" content="0;url=${url}">
     <style>body{font-family:system-ui,sans-serif;background:#0b0b0d;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}p{opacity:.7}</style>
     </head><body><div><p>${message}</p><p><a style="color:#9ad" href="${url}">Weiter…</a></p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const appBase = FALLBACK_APP_URL.replace(/\/+$/, '');
  const successUrl = `${appBase}/einstellungen?google_drive=connected`;
  const errorUrl = (msg: string) =>
    `${appBase}/einstellungen?google_drive=error&message=${encodeURIComponent(msg)}`;

  if (errorParam) {
    return htmlRedirect(errorUrl(errorParam), 'Google hat die Verbindung abgelehnt.');
  }
  if (!code || !state) {
    return htmlRedirect(errorUrl('missing_code_or_state'), 'Ungültige Antwort von Google.');
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate state and recover user_id, then delete it (one-time use)
    const { data: stateRow, error: stateError } = await admin
      .from('oauth_states')
      .select('user_id, expires_at')
      .eq('state', state)
      .maybeSingle();

    if (stateError || !stateRow) {
      return htmlRedirect(errorUrl('invalid_state'), 'Sitzungstoken ungültig oder abgelaufen.');
    }
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await admin.from('oauth_states').delete().eq('state', state);
      return htmlRedirect(errorUrl('state_expired'), 'Sitzungstoken abgelaufen.');
    }

    const userId = stateRow.user_id as string;
    await admin.from('oauth_states').delete().eq('state', state);

    // Look up Google credentials
    const { data: settings, error: settingsError } = await admin
      .from('integration_settings')
      .select('config')
      .eq('provider', 'google_drive')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (settingsError) {
      return htmlRedirect(errorUrl('settings_unavailable'), 'Google Credentials nicht abrufbar.');
    }
    const cfg = (settings?.[0]?.config as Record<string, unknown> | undefined) ?? {};
    const clientId = cfg.client_id as string | undefined;
    const clientSecret = cfg.client_secret as string | undefined;
    if (!clientId || !clientSecret) {
      return htmlRedirect(errorUrl('missing_credentials'), 'Client ID oder Secret fehlt.');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Token exchange failed:', tokenJson);
      const msg = tokenJson?.error_description || tokenJson?.error || 'token_exchange_failed';
      return htmlRedirect(errorUrl(msg), `Google Token-Austausch fehlgeschlagen: ${msg}`);
    }

    const accessToken = tokenJson.access_token as string;
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const expiresIn = (tokenJson.expires_in as number) ?? 3600;
    const scope = (tokenJson.scope as string) ?? 'https://www.googleapis.com/auth/drive email profile';

    if (!refreshToken) {
      return htmlRedirect(
        errorUrl('no_refresh_token'),
        'Kein Refresh Token erhalten. Bitte in Google Konto → Drittanbieter-Apps die Verbindung trennen und erneut versuchen.',
      );
    }

    // Fetch user info (email)
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = await userInfoRes.json();
    if (!userInfoRes.ok) {
      console.error('userinfo failed:', userInfo);
      return htmlRedirect(errorUrl('userinfo_failed'), 'Google Nutzerinfos nicht abrufbar.');
    }
    const googleEmail = userInfo.email as string;

    // Upsert connection
    const { error: upsertError } = await admin
      .from('google_drive_connections')
      .upsert(
        {
          user_id: userId,
          google_email: googleEmail,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
          scope,
          connected_at: new Date().toISOString(),
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (upsertError) {
      console.error('upsert failed:', upsertError);
      return htmlRedirect(errorUrl('save_failed'), 'Verbindung konnte nicht gespeichert werden.');
    }

    return htmlRedirect(successUrl, 'Google Drive verbunden — Du wirst weitergeleitet…');
  } catch (err) {
    console.error('google-oauth-callback error:', err);
    return htmlRedirect(errorUrl('unknown_error'), 'Unbekannter Fehler.');
  }
});
