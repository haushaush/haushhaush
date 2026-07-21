import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  targetUserId: string | null;
  memberEmail?: string;
}

export function MfaExemptCard({ targetUserId, memberEmail }: Props) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const isSelf = !!user && !!targetUserId && user.id === targetUserId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exempt, setExempt] = useState(false);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);

  const load = async () => {
    if (!targetUserId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('user_mfa_status')
      .select('two_factor_exempt, mfa_enrolled_at')
      .eq('user_id', targetUserId)
      .maybeSingle();
    setExempt(!!(data as any)?.two_factor_exempt);
    setEnrolledAt((data as any)?.mfa_enrolled_at ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetUserId]);

  if (!targetUserId) return null;
  if (!isAdmin) return null;

  const toggle = async (nextExempt: boolean) => {
    if (nextExempt && !confirm(`2FA für ${memberEmail || 'diesen Account'} ausschalten? Bestehende 2FA-Faktoren werden entfernt und der globale 2FA-Zwang gilt für diesen Account nicht mehr.`)) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-mfa-exempt', {
        body: { target_user_id: targetUserId, exempt: nextExempt },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(nextExempt ? '2FA für Account deaktiviert' : '2FA-Zwang wieder aktiv');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Fehler');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-[14px]">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {exempt ? <ShieldOff className="h-4 w-4 text-warning" /> : <ShieldCheck className="h-4 w-4 text-success" />}
          Zwei-Faktor-Authentifizierung
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {loading ? <Skeleton className="h-16" /> : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <Badge className={exempt
                ? 'bg-warning/20 text-warning border-warning/30'
                : 'bg-success/20 text-success border-success/30'}>
                {exempt ? '2FA für diesen Account deaktiviert' : (enrolledAt ? '2FA aktiv' : '2FA-Zwang aktiv')}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {exempt
                  ? 'Ein Admin hat 2FA für diesen Account deaktiviert.'
                  : 'Standard: Globaler 2FA-Zwang erzwingt Setup beim Login.'}
              </p>
            </div>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">Eigenes Konto – 2FA hier nicht änderbar.</p>
            ) : exempt ? (
              <Button size="sm" disabled={saving} onClick={() => toggle(false)}>
                2FA für Account einschalten
              </Button>
            ) : (
              <Button variant="destructive" size="sm" disabled={saving} onClick={() => toggle(true)}>
                2FA für Account ausschalten
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
