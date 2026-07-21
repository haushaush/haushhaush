import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ShieldOff, ShieldCheck, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  targetUserId: string | null;
  member: any;
}

export function ZugriffStatusCard({ targetUserId, member }: Props) {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole('admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [deactivatedAt, setDeactivatedAt] = useState<string | null>(null);
  const isSelf = user?.id === targetUserId;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [targetIsLastAdmin, setTargetIsLastAdmin] = useState(false);

  const load = async () => {
    if (!targetUserId) { setLoading(false); return; }
    const { data } = await supabase.from('user_access_status' as any)
      .select('is_active, deactivated_at').eq('user_id', targetUserId).maybeSingle();
    if (data) {
      setIsActive((data as any).is_active !== false);
      setDeactivatedAt((data as any).deactivated_at);
    } else { setIsActive(true); setDeactivatedAt(null); }

    // last-admin check
    const { data: targetRoles } = await supabase.from('user_roles')
      .select('role').eq('user_id', targetUserId);
    const isTargetAdmin = (targetRoles || []).some((r: any) => r.role === 'admin');
    if (isTargetAdmin) {
      const { count } = await supabase.from('user_roles')
        .select('user_id', { count: 'exact', head: true }).eq('role', 'admin');
      setTargetIsLastAdmin((count ?? 0) <= 1);
    } else {
      setTargetIsLastAdmin(false);
    }

    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetUserId]);

  const setActive = async (active: boolean) => {
    if (!targetUserId) return;
    setSaving(true);
    const payload: any = {
      user_id: targetUserId,
      is_active: active,
      deactivated_at: active ? null : new Date().toISOString(),
      deactivated_by: active ? null : user?.id,
    };
    const { error } = await (supabase.from('user_access_status' as any) as any).upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(active ? 'Mitarbeiter reaktiviert' : 'Mitarbeiter deaktiviert');
    load();
  };

  const handleDelete = async () => {
    if (!member?.id) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('delete-team-member', {
      body: { user_id: member.id, confirm_email: confirmEmail.trim() },
    });
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      setDeleting(false);
      toast.error('Löschung fehlgeschlagen', { description: errMsg });
      return;
    }
    setDeleting(false);
    setDeleteOpen(false);
    toast.success('Mitarbeiter wurde gelöscht.');
    navigate('/hr/mitarbeiter');
  };

  const canDelete = isAdmin && !isSelf && !targetIsLastAdmin;
  const emailMatches =
    !!member?.email &&
    confirmEmail.trim().toLowerCase() === String(member.email).trim().toLowerCase();

  return (
    <Card className="rounded-[14px]">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isActive ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldOff className="h-4 w-4 text-destructive" />}
          Zugriffs-Status
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {loading ? <Skeleton className="h-16" /> : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <Badge className={isActive ? 'bg-success/20 text-success border-success/30' : 'bg-destructive/20 text-destructive border-destructive/30'}>
                {isActive ? 'Aktiv' : 'Deaktiviert'}
              </Badge>
              {!isActive && deactivatedAt && (
                <p className="text-xs text-muted-foreground mt-1">seit {new Date(deactivatedAt).toLocaleString('de-DE')}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{member?.email}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isSelf ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Du kannst dich nicht selbst deaktivieren.</p>
              ) : targetUserId && isActive ? (
                <Button variant="destructive" size="sm" disabled={saving} onClick={() => setActive(false)}>Mitarbeiter deaktivieren</Button>
              ) : targetUserId ? (
                <Button size="sm" disabled={saving} onClick={() => setActive(true)}>Reaktivieren</Button>
              ) : null}

              {isAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!canDelete}
                  onClick={() => { setConfirmEmail(''); setDeleteOpen(true); }}
                  title={
                    isSelf ? 'Eigenes Konto kann nicht gelöscht werden'
                    : targetIsLastAdmin ? 'Der letzte Admin kann nicht gelöscht werden'
                    : 'Mitarbeiter dauerhaft löschen'
                  }
                >
                  <Trash2 className="h-4 w-4 mr-1" />Mitarbeiter löschen
                </Button>
              )}
            </div>
          </div>
        )}

        <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Mitarbeiter wirklich löschen?
              </DialogTitle>
              <DialogDescription className="pt-2">
                Diese Aktion löscht den Mitarbeiter dauerhaft aus dem System. Der Login-Zugang wird entfernt und der Mitarbeiter erscheint nicht mehr in der Mitarbeiterliste. Diese Aktion kann nicht rückgängig gemacht werden.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs">
                Bitte gib zur Bestätigung <span className="font-mono font-semibold text-destructive">{member?.email}</span> ein.
              </Label>
              <Input
                autoFocus
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={member?.email || 'email@…'}
                disabled={deleting}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Abbrechen</Button>
              <Button variant="destructive" disabled={!emailMatches || deleting} onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" />
                {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
