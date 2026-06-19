import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useDriveConnection() {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    google_email: string;
    connected_at: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.rpc as any)('drive_connection_status');
    const row = Array.isArray(data) ? data[0] : null;
    setConnection(row ? { google_email: row.google_email, connected_at: row.connected_at } : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connection, isConnected: !!connection, loading, refresh };
}
