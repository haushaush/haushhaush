import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'account-manager' | 'setter';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  isAdminOrManager: boolean;
  signOut: () => Promise<void>;
  isTestMode: boolean;
  activateTestMode: (password: string) => boolean;
}

const TEST_MODE_KEY = 'agency-hub-test-mode';
const TEST_PASSWORD_HASH = '1gPsnsh,wem.';

const FAKE_TEST_USER = {
  id: 'test-mode-user-00000000-0000-0000-0000-000000000000',
  email: 'testmode@agencyhub.dev',
  app_metadata: {},
  user_metadata: { full_name: 'Test Mode' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as unknown as User;

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isTestMode, setIsTestMode] = useState(() => sessionStorage.getItem(TEST_MODE_KEY) === 'active');

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (data) {
      setRoles(data.map(r => r.role as AppRole));
    }
  };

  const activateTestMode = (password: string): boolean => {
    if (password === TEST_PASSWORD_HASH) {
      sessionStorage.setItem(TEST_MODE_KEY, 'active');
      setIsTestMode(true);
      setUser(FAKE_TEST_USER);
      setRoles(['admin']);
      setLoading(false);
      return true;
    }
    return false;
  };

  useEffect(() => {
    // If test mode is active, skip real auth
    if (isTestMode) {
      setUser(FAKE_TEST_USER);
      setRoles(['admin']);
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRoles(session.user.id), 0);
        } else {
          setRoles([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isTestMode]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdminOrManager = roles.includes('admin') || roles.includes('account-manager');

  const signOut = async () => {
    if (isTestMode) {
      sessionStorage.removeItem(TEST_MODE_KEY);
      setIsTestMode(false);
      setUser(null);
      setRoles([]);
      return;
    }
    await supabase.auth.signOut();
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, hasRole, isAdminOrManager, signOut, isTestMode, activateTestMode }}>
      {children}
    </AuthContext.Provider>
  );
}
