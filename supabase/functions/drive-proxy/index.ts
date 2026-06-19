// drive-proxy
// Proxies Google Drive API v3 calls for the authenticated user.
// Reads tokens from google_drive_connections, refreshes access_token if expired.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FILE_FIELDS =
  'nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink,webViewLink,owners(displayName,emailAddress,photoLink),parents,shared,trashed)';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function refreshAccessToken(
  admin: ReturnType<typeof createClient>,
  refreshToken: string,
): Promise<string | null> {
  const { data: settings } = await admin
    .from('integration_settings')
    .select('config')
    .eq('provider', 'google_drive')
    .order('updated_at', { ascending: false })
    .limit(1);

  const cfg = (settings?.[0]?.config as Record<string, unknown> | undefined) ?? {};
  const clientId = cfg.client_id as string | undefined;
  const clientSecret = cfg.client_secret as string | undefined;
  if (!clientId || !clientSecret) {
    console.error('Missing Google credentials for refresh');
    return null;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const j = await res.json();
  if (!res.ok) {
    console.error('Token refresh failed:', j);
    return null;
  }

  const accessToken = j.access_token as string;
  const expiresIn = (j.expires_in as number) ?? 3600;

  await admin
    .from('google_drive_connections')
    .update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      last_refreshed_at: new Date().toISOString(),
    })
    .eq('is_primary', true);

  return accessToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: conn, error: connError } = await admin
      .from('google_drive_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (connError || !conn) {
      return json({ error: 'not_connected', message: 'Keine Google Drive Verbindung gefunden.' }, 401);
    }

    let accessToken = conn.access_token as string;
    const expiresAt = new Date(conn.expires_at as string).getTime();
    if (expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(admin, userId, conn.refresh_token as string);
      if (!refreshed) {
        return json({ error: 'token_refresh_failed', message: 'Token-Refresh fehlgeschlagen.' }, 401);
      }
      accessToken = refreshed;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action as string | undefined;
    if (!action) return json({ error: 'missing_action' }, 400);

    let driveUrl = '';

    if (action === 'list') {
      const folderId = (body.folderId as string | undefined) ?? 'root';
      const pageToken = body.pageToken as string | undefined;
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: FILE_FIELDS,
        pageSize: '100',
        orderBy: 'folder,modifiedTime desc',
      });
      if (pageToken) params.set('pageToken', pageToken);
      driveUrl = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    } else if (action === 'search') {
      const query = (body.query as string | undefined) ?? '';
      const pageToken = body.pageToken as string | undefined;
      const escaped = query.replace(/'/g, "\\'");
      const params = new URLSearchParams({
        q: `name contains '${escaped}' and trashed = false`,
        fields: FILE_FIELDS,
        pageSize: '100',
        orderBy: 'modifiedTime desc',
      });
      if (pageToken) params.set('pageToken', pageToken);
      driveUrl = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    } else if (action === 'shared') {
      const pageToken = body.pageToken as string | undefined;
      const params = new URLSearchParams({
        q: 'sharedWithMe = true and trashed = false',
        fields: FILE_FIELDS,
        pageSize: '100',
        orderBy: 'modifiedTime desc',
      });
      if (pageToken) params.set('pageToken', pageToken);
      driveUrl = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    } else if (action === 'trash') {
      const pageToken = body.pageToken as string | undefined;
      const params = new URLSearchParams({
        q: 'trashed = true',
        fields: FILE_FIELDS,
        pageSize: '100',
        orderBy: 'modifiedTime desc',
      });
      if (pageToken) params.set('pageToken', pageToken);
      driveUrl = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    } else if (action === 'recent') {
      const params = new URLSearchParams({
        q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
        fields: FILE_FIELDS,
        pageSize: '10',
        orderBy: 'modifiedTime desc',
      });
      driveUrl = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    } else if (action === 'about') {
      driveUrl =
        'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(displayName,emailAddress,photoLink)';
    } else if (action === 'get') {
      const fileId = body.fileId as string | undefined;
      if (!fileId) return json({ error: 'missing_fileId' }, 400);
      driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=*`;
    } else if (action === 'breadcrumb') {
      // Fetches a single folder's name + parent for breadcrumb building
      const fileId = body.fileId as string | undefined;
      if (!fileId) return json({ error: 'missing_fileId' }, 400);
      driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId,
      )}?fields=id,name,parents,mimeType`;
    } else {
      return json({ error: 'unknown_action' }, 400);
    }

    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const driveJson = await driveRes.json().catch(() => ({}));

    if (driveRes.status === 401) {
      console.error('Drive returned 401 — clearing connection for user', userId);
      return json({ error: 'unauthorized', message: 'Drive Verbindung ist ungültig.' }, 401);
    }
    if (!driveRes.ok) {
      console.error('Drive API error:', driveRes.status, driveJson);
      return json({ error: 'drive_api_error', status: driveRes.status, details: driveJson }, driveRes.status);
    }

    return json(driveJson, 200);
  } catch (err) {
    console.error('drive-proxy error:', err);
    return json({ error: (err as Error).message || 'unknown_error' }, 500);
  }
});
