import { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldAlert, Loader2, UserX } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  permissionKey?: string;
}

export function PermissionRoute({ children, permissionKey }: Props) {
  const navigate = useNavigate();
  const { loading: authLoading, user, signOut } = useAuth();
  const { loading: permLoading, hasPermission, isAdmin, isActive } = usePermissions();

  if (authLoading || permLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!isAdmin && !isActive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <UserX className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Zugang deaktiviert</h1>
        <p className="text-muted-foreground mb-6">
          Dein Zugang wurde deaktiviert. Bitte wende dich an einen Administrator.
        </p>
        <Button onClick={() => signOut()}>Abmelden</Button>
      </div>
    );
  }

  if (permissionKey && !hasPermission(permissionKey)) {
    const canSeeDashboard = hasPermission('dashboard.view');
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Kein Zugriff</h1>
        <p className="text-muted-foreground mb-2">
          Du hast keine Berechtigung für diesen Bereich.
        </p>
        <p className="text-xs text-muted-foreground mb-6 font-mono">{permissionKey}</p>
        <div className="flex gap-3">
          {canSeeDashboard && (
            <Button onClick={() => navigate('/')}>Zurück zur Übersicht</Button>
          )}
          <Button variant="outline" onClick={() => signOut()}>Abmelden</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
