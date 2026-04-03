import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ProfileData {
  name: string;
  rolle: string | null;
  profilbild_url: string | null;
  abteilung: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('team')
        .select('name, rolle, department')
        .eq('email', user.email || '')
        .maybeSingle();

      if (!error && data) {
        setProfile({
          name: data.name,
          rolle: data.rolle,
          profilbild_url: user.user_metadata?.avatar_url || null,
          abteilung: data.department,
        });
      } else {
        const prefix = (user.email || '').split('@')[0];
        setProfile({
          name: prefix.charAt(0).toUpperCase() + prefix.slice(1),
          rolle: null,
          profilbild_url: user.user_metadata?.avatar_url || null,
          abteilung: null,
        });
      }
      setLoading(false);
    };

    fetchProfile();

    // CORRECT ORDER: .on() first, .subscribe() last
    const channel = supabase
      .channel(`profile-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team',
        },
        () => fetchProfile()
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('Profile realtime subscription failed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email]);

  const displayName = profile?.name || user?.email?.split('@')[0] || 'Nutzer';
  const firstName = displayName.split(' ')[0];
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = profile?.profilbild_url || user?.user_metadata?.avatar_url || null;

  return { profile, displayName, firstName, initials, avatarUrl, loading };
}
