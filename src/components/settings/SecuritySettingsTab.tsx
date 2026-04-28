import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, ShieldAlert, Trash2, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MfaEnrollScreen } from '@/components/mfa/MfaEnrollScreen';

interface TrustedDevice {
  id: string;
  device_name: string | null;
  user_agent: string | null;
  trusted_until: string;
  created_at: string;
}

interface MfaStatus {
  mfa_enrolled_at: string | null;
}

export function SecuritySettingsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasFactor, setHasFactor] = useState(false);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [recoveryRemaining, setRecoveryRemaining] = useState<{ remaining: number; total: number }>({ remaining: 0, total: 0 });
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: factors }, { data: statusRow }, { data: deviceRows }, { data: codeRows }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.from('user_mfa_status').select('mfa_enrolled_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('mfa_trusted_devices').select('id, device_name, user_agent, trusted_until, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('mfa_recovery_codes').select('used_at').eq('user_id', user.id),
      ]);
      const totp = (factors?.totp ?? []) as Array<{ status: string }>;
      setHasFactor(totp.some((f) => f.status === 'verified'));
      setStatus(statusRow as MfaStatus | null);
      setDevices((deviceRows ?? []) as TrustedDevice[]);
      const total = codeRows?.length ?? 0;
      const remaining = (codeRows ?? []).filter((c: any) => !c.used_at).length;
      setRecoveryRemaining({ remaining, total });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function removeDevice(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from('mfa_trusted_devices').delete().eq('id', id);
      if (error) throw error;
      toast.success('Gerät entfernt');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa() {
    if (!confirm('2FA wirklich deaktivieren? Dein Konto ist danach nur noch durch das Passwort geschützt.')) return;
    setBusy(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = (factors?.totp ?? []) as Array<{ id: string }>;
      for (const f of totp) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      await supabase.from('user_mfa_status').upsert({
        user_id: user!.id, mfa_enrolled_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      await supabase.from('mfa_recovery_codes').delete().eq('user_id', user!.id);
      toast.success('2FA deaktiviert');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {hasFactor ? <ShieldCheck className="w-5 h-5 text-primary" /> : <ShieldAlert className="w-5 h-5 text-warning" />}
            Zwei-Faktor-Authentifizierung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">Status</span>
                {hasFactor ? (
                  <Badge variant="default" className="text-xs">Aktiv</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Nicht eingerichtet</Badge>
                )}
              </div>
              {status?.mfa_enrolled_at && (
                <p className="text-xs text-muted-foreground">
                  Eingerichtet am {new Date(status.mfa_enrolled_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasFactor ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEnrollOpen(true)}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Neu einrichten
                  </Button>
                  <Button variant="ghost" size="sm" onClick={disableMfa} disabled={busy} className="text-destructive hover:text-destructive">
                    Deaktivieren
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setEnrollOpen(true)}>2FA einrichten</Button>
              )}
            </div>
          </div>

          {hasFactor && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Recovery-Codes</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {recoveryRemaining.remaining}/{recoveryRemaining.total} verbleibend
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEnrollOpen(true)}>
                  Neue generieren
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trusted devices */}
      {hasFactor && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              Vertrauenswürdige Geräte
            </CardTitle>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Keine vertrauenswürdigen Geräte</p>
            ) : (
              <div className="space-y-2">
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium">{d.device_name || 'Unbekanntes Gerät'}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Hinzugefügt {new Date(d.created_at).toLocaleDateString('de-DE')} · gültig bis {new Date(d.trusted_until).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeDevice(d.id)} disabled={busy}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>2FA einrichten</DialogTitle>
          </DialogHeader>
          <MfaEnrollScreen onComplete={() => { setEnrollOpen(false); load(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
