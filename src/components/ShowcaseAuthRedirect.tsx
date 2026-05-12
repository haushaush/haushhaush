import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Wraps the internal /sales/referenz-showcase routes. If the user is not
 * authenticated, redirect them to the equivalent /showcase public route
 * instead of /auth.
 */
export function ShowcaseAuthRedirect({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const { pathname, search } = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const publicPath = pathname.replace('/sales/referenz-showcase', '/showcase');
    return <Navigate to={publicPath + search} replace />;
  }

  return <>{children}</>;
}
