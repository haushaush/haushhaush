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

  useEffect(() => {
    if (!user?.id) return;

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('team')
        .select('name, rolle, department')
        .eq('email', user.email || '')
        .maybeSingle();

      if (data) {
        setProfile({
          name: data.name,
          rolle: data.rolle,
          profilbild_url: user.user_metadata?.avatar_url || null,
          abteilung: data.department,
        });
      } else {
        // Fallback
        const prefix = (user.email || '').split('@')[0];
        setProfile({
          name: prefix.charAt(0).toUpperCase() + prefix.slice(1),
          rolle: null,
          profilbild_url: user.user_metadata?.avatar_url || null,
          abteilung: null,
        });
      }
    };

    fetchProfile();

    const sub = supabase
      .channel(`profile-changes-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'team',
      }, () => fetchProfile())
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user?.id, user?.email]);

  const displayName = profile?.name || user?.email?.split('@')[0] || 'Nutzer';
  const firstName = displayName.split(' ')[0];
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = profile?.profilbild_url || user?.user_metadata?.avatar_url || null;

  return { profile, displayName, firstName, initials, avatarUrl };
}
