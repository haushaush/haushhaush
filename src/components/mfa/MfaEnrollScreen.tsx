import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Copy, Printer, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { generateRecoveryCodes } from '@/lib/mfa';

interface Props {
  onComplete: () => void;
  required?: boolean;
}

export function MfaEnrollScreen({ onComplete, required }: Props) {
  const [stage, setStage] = useState<'qr' | 'recovery'>('qr');
  const [qrSvg, setQrSvg] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrolling, setEnrolling] = useState(true);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    enroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enroll() {
    setEnrolling(true);
    try {
      // Clean up any existing unverified factors first
      const { data: list } = await supabase.auth.mfa.listFactors();
      const existing = list?.totp ?? [];
      for (const f of existing) {
        if (f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Haush Haush CRM ${Date.now()}`,
      });
      if (error) {
        toast.error('MFA-Setup fehlgeschlagen', { description: error.message });
        return;
      }
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    } finally {
      setEnrolling(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error) {
        toast.error("Code falsch. Versuch's nochmal.");
        setCode('');
        return;
      }
      // Generate + persist recovery codes
      const codes = generateRecoveryCodes(8);
      setRecoveryCodes(codes);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch(
          `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/save-recovery-codes`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ codes }),
          },
        );
        if (!res.ok) {
          toast.error('Recovery-Codes konnten nicht gespeichert werden');
        }
      }
      setStage('recovery');
    } finally {
      setBusy(false);
    }
  }

  if (enrolling) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === 'recovery') {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-6">
          <ShieldCheck className="w-12 h-12 mx-auto text-primary mb-2" />
          <h1 className="text-2xl font-bold">2FA eingerichtet</h1>
        </div>
        <div className="rounded-xl border border-warning/30 p-4 mb-4" style={{ backgroundColor: 'rgba(255,159,10,0.10)' }}>
          <p className="font-semibold text-foreground mb-1 text-sm">⚠️ Recovery-Codes speichern</p>
          <p className="text-xs text-muted-foreground">
            Falls du dein Handy verlierst, brauchst du einen dieser Codes um wieder reinzukommen.
            Speichere sie sicher (z.B. 1Password). Jeder Code funktioniert nur ein einziges Mal.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4 font-mono text-sm grid grid-cols-2 gap-2">
          {recoveryCodes.map((c, i) => <div key={i} className="tabular-nums">{c}</div>)}
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              navigator.clipboard.writeText(recoveryCodes.join('\n'));
              toast.success('Kopiert');
            }}
          >
            <Copy className="w-4 h-4 mr-2" /> Kopieren
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Drucken
          </Button>
        </div>
        <Button className="w-full mt-6 h-12 rounded-[10px]" onClick={onComplete}>
          Ich habe die Codes sicher gespeichert
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Zwei-Faktor-Authentifizierung einrichten</h1>
        <p className="text-sm text-muted-foreground">
          {required
            ? 'Dein Konto erfordert 2FA. Verbinde eine Authenticator-App.'
            : 'Schütze dein Konto zusätzlich mit einer Authenticator-App.'}
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold mb-1">1. App installieren</p>
          <p className="text-xs text-muted-foreground">
            Google Authenticator · Microsoft Authenticator · 1Password · Authy · Bitwarden
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">2. QR-Code scannen</p>
          <div
            className="bg-white p-4 rounded-xl border border-border flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Manuell eingeben
            </summary>
            <code className="block mt-2 p-2 bg-muted rounded text-xs break-all font-mono">{secret}</code>
          </details>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">3. Code aus App eingeben</p>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="h-14 text-center text-2xl tracking-[0.4em] font-mono tabular-nums"
            autoFocus
          />
          <Button
            onClick={verify}
            disabled={code.length !== 6 || busy}
            className="w-full mt-3 h-12 rounded-[10px]"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Verifizieren
          </Button>
        </div>
      </div>
    </div>
  );
}
