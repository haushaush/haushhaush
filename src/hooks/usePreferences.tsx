import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PreferencesContextType {
  showAria: boolean;
  setShowAria: (v: boolean) => Promise<void>;
  loading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType>({
  showAria: true,
  setShowAria: async () => {},
  loading: true,
});

export const usePreferences = () => useContext(PreferencesContext);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [showAria, setShowAriaState] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setShowAriaState(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('show_aria')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) setShowAriaState(data.show_aria);
      else setShowAriaState(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const setShowAria = useCallback(async (v: boolean) => {
    if (!user) return;
    const prev = showAria;
    setShowAriaState(v); // optimistic
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, show_aria: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
      setShowAriaState(prev);
      throw error;
    }
  }, [user, showAria]);

  return (
    <PreferencesContext.Provider value={{ showAria, setShowAria, loading }}>
      {children}
    </PreferencesContext.Provider>
  );
}
