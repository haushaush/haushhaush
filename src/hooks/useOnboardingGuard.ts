import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Forces newly created team members to complete the onboarding wizard
 * (mandatory password change + optional HR data) before accessing the portal.
 */
export function useOnboardingGuard() {
  const { user, isTestMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['team-onboarding-self', user?.id],
    enabled: !!user && !isTestMode,
    staleTime: 30_000,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('team')
        .select('must_change_password, onboarding_completed_at')
        .eq('id', user.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    if (isTestMode) return;
    const needsOnboarding = data.must_change_password === true;
    if (needsOnboarding && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [data, location.pathname, navigate, isTestMode]);
}
