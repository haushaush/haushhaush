import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useDriveConnection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    id: string;
    google_email: string;
    expires_at: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setConnection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('google_drive_connections')
      .select('id, google_email, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    setConnection(data ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connection, isConnected: !!connection, loading, refresh };
}
