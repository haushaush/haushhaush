import { ReactNode, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { loading, hasRole, user } = useAuth();
  const toastShown = useRef(false);

  const isAdmin = !!user && hasRole('admin');

  useEffect(() => {
    if (!loading && !isAdmin && !toastShown.current) {
      toastShown.current = true;
      toast.error('Du hast keine Berechtigung für diesen Bereich');
    }
  }, [loading, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-6 w-6 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
