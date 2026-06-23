import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  targetUserId: string | null;
  member: any;
}

export function ZugriffStatusCard({ targetUserId, member }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [deactivatedAt, setDeactivatedAt] = useState<string | null>(null);
  const isSelf = user?.id === targetUserId;

  const load = async () => {
    if (!targetUserId) { setLoading(false); return; }
    const { data } = await supabase.from('user_access_status' as any)
      .select('is_active, deactivated_at').eq('user_id', targetUserId).maybeSingle();
    if (data) {
      setIsActive((data as any).is_active !== false);
      setDeactivatedAt((data as any).deactivated_at);
    } else { setIsActive(true); setDeactivatedAt(null); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetUserId]);

  if (!targetUserId) return null;

  const setActive = async (active: boolean) => {
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
            {isSelf ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Du kannst dich nicht selbst deaktivieren.</p>
            ) : isActive ? (
              <Button variant="destructive" size="sm" disabled={saving} onClick={() => setActive(false)}>Mitarbeiter deaktivieren</Button>
            ) : (
              <Button size="sm" disabled={saving} onClick={() => setActive(true)}>Reaktivieren</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
