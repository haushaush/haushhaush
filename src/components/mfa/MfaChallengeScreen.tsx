import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { trustCurrentDevice } from '@/lib/mfa';

interface Props {
  factorId: string;
  userId: string;
  onSuccess: () => void;
  onRecoverySuccess: () => void;
  onCancel?: () => void;
}

export function MfaChallengeScreen({ factorId, userId, onSuccess, onRecoverySuccess, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  async function verify() {
    if (code.length !== 6) return;
    if (failedAttempts >= 5) {
      toast.error('Zu viele Fehlversuche. Bitte später erneut versuchen.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) {
        setFailedAttempts((n) => n + 1);
        toast.error('Code falsch');
        setCode('');
        return;
      }
      if (trustDevice) {
        await trustCurrentDevice(userId);
      }
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  async function verifyRecovery() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sitzung abgelaufen');
        return;
      }
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/verify-recovery-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code: recoveryCode }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Recovery-Code ungültig');
        return;
      }
      toast.success('Recovery erfolgreich. Bitte 2FA neu einrichten.');
      onRecoverySuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-6">
        <ShieldCheck className="w-12 h-12 mx-auto text-primary mb-2" />
        <h1 className="text-2xl font-bold">Zwei-Faktor-Authentifizierung</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {showRecovery
            ? 'Gib einen deiner 8 Recovery-Codes ein.'
            : 'Gib den 6-stelligen Code aus deiner Authenticator-App ein.'}
        </p>
      </div>

      {!showRecovery ? (
        <>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            placeholder="000000"
            autoFocus
            className="h-14 text-center text-2xl tracking-[0.4em] font-mono tabular-nums"
          />
          <label className="flex items-start gap-3 mt-4 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border accent-primary cursor-pointer"
            />
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">Dieses Gerät 30 Tage merken</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Bei nächsten Logins von diesem Browser kein Code mehr nötig
              </div>
            </div>
          </label>
          <Button
            onClick={verify}
            disabled={code.length !== 6 || busy}
            className="w-full mt-4 h-12 rounded-[10px]"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Bestätigen
          </Button>
          <button
            onClick={() => setShowRecovery(true)}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Authenticator verloren? Recovery-Code nutzen
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Abbrechen & abmelden
            </button>
          )}
        </>
      ) : (
        <>
          <Input
            type="text"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && verifyRecovery()}
            placeholder="XXXX-XXXX"
            autoFocus
            className="h-12 text-center text-lg font-mono tracking-wider"
          />
          <Button
            onClick={verifyRecovery}
            disabled={recoveryCode.length < 4 || busy}
            className="w-full mt-4 h-12 rounded-[10px]"
            variant="default"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Recovery-Code verwenden
          </Button>
          <button
            onClick={() => setShowRecovery(false)}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ← Zurück zur App-Eingabe
          </button>
        </>
      )}
    </div>
  );
}
