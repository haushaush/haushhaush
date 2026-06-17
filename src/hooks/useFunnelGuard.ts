import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function getFunnelType(): 'checkin' | 'checkout' {
  return new Date().getHours() < 11 ? 'checkin' : 'checkout';
}

const SKIP_ROUTES = ['/auth', '/registrierung', '/register', '/onboarding', '/recovery', '/funnel', '/showcase', '/review'];

/**
 * Forces non-admin users to complete the daily Check-in before they can
 * access the dashboard. Only redirects once per session and only for the
 * morning check-in (so users can use the app during the day even if they
 * haven't done their checkout yet).
 */
export function useFunnelGuard() {
  const { user, isTestMode, hasRole, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = hasRole?.('admin');

  const { data } = useQuery({
    queryKey: ['daily-checkin-self', user?.id, todayISO()],
    enabled: !!user && !isTestMode && !isAdmin && !loading,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('daily_checkins')
        .select('type')
        .eq('user_id', user.id)
        .eq('date', todayISO());
      return data || [];
    },
  });

  useEffect(() => {
    if (!user || loading || isTestMode || isAdmin) return;
    if (!data) return;
    if (SKIP_ROUTES.some(r => location.pathname.startsWith(r))) return;

    const hour = new Date().getHours();
    if (hour >= 11) return; // only force checkin window
    const hasCheckin = data.some((r: any) => r.type === 'checkin');
    if (!hasCheckin) {
      navigate('/funnel', { replace: true });
    }
  }, [user, data, loading, isTestMode, isAdmin, location.pathname, navigate]);
}
