import { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export function AdminRoute({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { loading, hasRole, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isAdmin = hasRole('admin');

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Zugriff verweigert</h1>
        <p className="text-muted-foreground mb-2">
          Du hast keine Berechtigung für diesen Bereich.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Erforderliche Rolle: <strong>Admin</strong>
        </p>
        <Button onClick={() => navigate('/uebersicht')}>
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
