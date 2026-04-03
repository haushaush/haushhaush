import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProfileData {
  name: string;
  rolle: string | null;
  profilbild_url: string | null;
  abteilung: string | null;
}

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      // Step 1: get session FIRST — do nothing if no session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setLoading(false);
        return; // EXIT early, no subscription created
      }

      const user = session.user;

      // Step 2: fetch profile
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

      await fetchProfile();

      // Step 3: subscribe ONLY after confirming session exists
      channel = supabase
        .channel(`profile-changes-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'team',
          },
          () => fetchProfile()
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const user_email = profile?.name ? undefined : null;
  const displayName = profile?.name || 'Nutzer';
  const firstName = displayName.split(' ')[0];
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = profile?.profilbild_url || null;

  return { profile, displayName, firstName, initials, avatarUrl, loading };
}
