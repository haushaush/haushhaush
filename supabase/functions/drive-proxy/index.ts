// drive-proxy
// Proxies Google Drive API v3 calls using the central (is_primary) Google Drive connection.
// Enforces per-user / per-role visibility for non-admins via drive_permissions.
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

const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
};

async function driveGet(accessToken: string, fileId: string, fields = 'id,name,mimeType,parents'): Promise<DriveFile | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  return (await res.json()) as DriveFile;
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
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: userError } = await userClient.auth.getClaims(token);
    if (userError || !claimsData?.claims?.sub) {
      console.error('drive-proxy auth failed:', userError);
      return json({ error: 'Unauthorized', details: userError?.message }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine admin status
    const { data: adminRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Load user's team_rolle (if any) for role-based grants
    let userRole: string | null = null;
    if (!isAdmin) {
      const { data: userRow } = await admin.auth.admin.getUserById(userId);
      const email = userRow?.user?.email;
      if (email) {
        const { data: teamRow } = await admin
          .from('team')
          .select('rolle')
          .ilike('email', email)
          .maybeSingle();
        userRole = (teamRow?.rolle as string | null) ?? null;
      }
    }

    // Load all permissions for this user (only needed for non-admins)
    let grantedIds = new Set<string>();
    if (!isAdmin) {
      const orParts: string[] = [`grantee_user_id.eq.${userId}`];
      if (userRole) orParts.push(`and(grantee_type.eq.role,grantee_role.eq.${userRole})`);
      const { data: perms } = await admin
        .from('drive_permissions')
        .select('drive_item_id,item_type,item_name')
        .or(orParts.join(','));
      grantedIds = new Set((perms ?? []).map((p) => p.drive_item_id as string));
    }

    const { data: conn, error: connError } = await admin
      .from('google_drive_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('is_primary', true)
      .maybeSingle();

    if (connError || !conn) {
      return json({ error: 'not_connected', message: 'Keine Google Drive Verbindung gefunden.' }, 401);
    }

    let accessToken = conn.access_token as string;
    const expiresAt = new Date(conn.expires_at as string).getTime();
    if (expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(admin, conn.refresh_token as string);
      if (!refreshed) {
        return json({ error: 'token_refresh_failed', message: 'Token-Refresh fehlgeschlagen.' }, 401);
      }
      accessToken = refreshed;
    }

    // ancestor cache per request
    const ancestorCache = new Map<string, boolean>();
    async function ancestorAllowed(itemId: string): Promise<boolean> {
      if (isAdmin) return true;
      if (grantedIds.has(itemId)) return true;
      if (ancestorCache.has(itemId)) return ancestorCache.get(itemId)!;

      let currentId = itemId;
      const visited = new Set<string>();
      for (let i = 0; i < 20; i++) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        if (grantedIds.has(currentId)) {
          ancestorCache.set(itemId, true);
          return true;
        }
        const f = await driveGet(accessToken, currentId, 'id,parents');
        const parent = f?.parents?.[0];
        if (!parent) break;
        currentId = parent;
      }
      ancestorCache.set(itemId, false);
      return false;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action as string | undefined;
    if (!action) return json({ error: 'missing_action' }, 400);

    // -------- Non-admin: virtual root for 'list' --------
    if (!isAdmin && action === 'list') {
      const folderId = (body.folderId as string | undefined) ?? 'root';
      if (folderId === 'root') {
        if (grantedIds.size === 0) {
          return json({ files: [] }, 200);
        }
        // Fetch metadata for every directly granted item, return as virtual root listing
        const files: DriveFile[] = [];
        await Promise.all(
          Array.from(grantedIds).map(async (id) => {
            const f = await driveGet(
              accessToken,
              id,
              'id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink,webViewLink,owners(displayName,emailAddress,photoLink),parents,shared,trashed',
            );
            if (f && !(f as { trashed?: boolean }).trashed) files.push(f);
          }),
        );
        return json({ files }, 200);
      }
      // Sub-folder: must be allowed (granted itself or descendant of granted)
      const ok = await ancestorAllowed(folderId);
      if (!ok) return json({ files: [] }, 200);
      // proceed with normal Drive list below
    }

    // -------- Build Drive URL for the request --------
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
      if (!isAdmin) {
        const ok = await ancestorAllowed(fileId);
        if (!ok) return json({ error: 'forbidden' }, 403);
      }
      driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=*`;
    } else if (action === 'breadcrumb') {
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
      console.error('Drive returned 401 — token problem');
      return json({ error: 'unauthorized', message: 'Drive Verbindung ist ungültig.' }, 401);
    }
    if (!driveRes.ok) {
      console.error('Drive API error:', driveRes.status, driveJson);
      return json({ error: 'drive_api_error', status: driveRes.status, details: driveJson }, driveRes.status);
    }

    // -------- Non-admin filtering on results --------
    if (!isAdmin) {
      // 'about' is harmless metadata; allow as-is.
      if (action === 'shared' || action === 'trash' || action === 'recent') {
        const files = ((driveJson as { files?: DriveFile[] }).files ?? []);
        const kept: DriveFile[] = [];
        for (const f of files) {
          if (await ancestorAllowed(f.id)) kept.push(f);
        }
        return json({ ...(driveJson as object), files: kept }, 200);
      }
      if (action === 'search') {
        const files = ((driveJson as { files?: DriveFile[] }).files ?? []);
        const kept: DriveFile[] = [];
        for (const f of files) {
          if (await ancestorAllowed(f.id)) kept.push(f);
        }
        return json({ ...(driveJson as object), files: kept }, 200);
      }
      // 'list' on an allowed sub-folder: full content is allowed (folder grant is recursive).
    }

    return json(driveJson, 200);
  } catch (err) {
    console.error('drive-proxy error:', err);
    return json({ error: (err as Error).message || 'unknown_error' }, 500);
  }
});
