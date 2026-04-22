import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  owners?: { displayName: string; emailAddress: string; photoLink?: string }[];
  parents?: string[];
  shared?: boolean;
  trashed?: boolean;
};

export type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

export type DriveAboutResponse = {
  storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  user?: { displayName: string; emailAddress: string; photoLink?: string };
};

type Action =
  | { action: 'list'; folderId?: string; pageToken?: string }
  | { action: 'search'; query: string; pageToken?: string }
  | { action: 'shared'; pageToken?: string }
  | { action: 'trash'; pageToken?: string }
  | { action: 'recent' }
  | { action: 'about' }
  | { action: 'get'; fileId: string }
  | { action: 'breadcrumb'; fileId: string };

async function handleUnauthorized() {
  // Token revoked or invalid — delete connection row
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('google_drive_connections').delete().eq('user_id', user.id);
  }
  toast.error('Google Drive Verbindung wurde getrennt — bitte neu verbinden');
  setTimeout(() => {
    window.location.href = '/einstellungen';
  }, 1500);
}

export async function callDriveProxy<T = unknown>(payload: Action): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke('drive-proxy', { body: payload });

  if (error) {
    // supabase-js wraps non-2xx responses as errors; check the message
    const msg = (error as { message?: string }).message || '';
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
      await handleUnauthorized();
      return null;
    }
    console.error('drive-proxy error:', error);
    toast.error('Drive Anfrage fehlgeschlagen');
    return null;
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const errCode = (data as { error: string }).error;
    if (errCode === 'unauthorized' || errCode === 'not_connected' || errCode === 'token_refresh_failed') {
      await handleUnauthorized();
      return null;
    }
    console.error('drive-proxy returned error:', data);
    toast.error('Drive Anfrage fehlgeschlagen');
    return null;
  }

  return data as T;
}
