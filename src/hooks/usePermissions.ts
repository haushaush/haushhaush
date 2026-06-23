import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface EffectivePermission {
  permission_key: string;
  label: string;
  category: string;
  description: string | null;
  role_granted: boolean;
  user_override: boolean | null;
  effective_granted: boolean;
}

export function usePermissions() {
  const { user, hasRole, loading: authLoading, isTestMode } = useAuth();
  const isAdmin = hasRole?.('admin') ?? false;
  const [permissions, setPermissions] = useState<EffectivePermission[]>([]);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || isTestMode) {
      setPermissions([]);
      setIsActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: perms }, { data: status }] = await Promise.all([
      (supabase.rpc as any)('get_effective_user_permissions', { target_user_id: user.id }),
      supabase.from('user_access_status' as any).select('is_active').eq('user_id', user.id).maybeSingle(),
    ]);
    setPermissions((perms as EffectivePermission[]) || []);
    setIsActive(status ? (status as any).is_active !== false : true);
    setLoading(false);
  }, [user?.id, isTestMode]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const hasPermission = useCallback(
    (key: string) => {
      if (isAdmin || isTestMode) return true;
      if (!isActive) return false;
      const p = permissions.find(p => p.permission_key === key);
      return p ? p.effective_granted : false;
    },
    [permissions, isAdmin, isActive, isTestMode]
  );

  return { permissions, hasPermission, isAdmin, isActive, loading, reload: load };
}
