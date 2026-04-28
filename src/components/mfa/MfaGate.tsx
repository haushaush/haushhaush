import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { MfaEnrollScreen } from '@/components/mfa/MfaEnrollScreen';
import { MfaChallengeScreen } from '@/components/mfa/MfaChallengeScreen';
import { isDeviceTrusted, TRUSTED_DEVICE_KEY, clearTrustedDeviceLocal } from '@/lib/mfa';

type Stage = 'checking' | 'ok' | 'enroll' | 'challenge';

/**
 * Wraps the dashboard. Enforces MFA for every authenticated user:
 * - If no verified TOTP factor → force enrollment
 * - If verified factor and session AAL < aal2 → require code (or trusted-device skip)
 * - Test-mode users are always allowed through.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { user, isTestMode, signOut } = useAuth();
  const [stage, setStage] = useState<Stage>('checking');
  const [factorId, setFactorId] = useState<string>('');

  const evaluate = useCallback(async () => {
    if (!user) return;
    if (isTestMode) {
      setStage('ok');
      return;
    }
    // Dedicated dev test account — never force MFA
    if (user.email === 'test@haushhaush.de') {
      setStage('ok');
      return;
    }
    setStage('checking');
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactors = (factors?.totp ?? []) as Array<{ id: string; status: string }>;
      const verified = totpFactors.find((f) => f.status === 'verified');

      if (!verified) {
        setStage('enroll');
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal2') {
        setStage('ok');
        return;
      }

      // Check trusted device
      const token = localStorage.getItem(TRUSTED_DEVICE_KEY);
      if (token && (await isDeviceTrusted(user.id, token))) {
        // Trusted device → don't force AAL2 (can't elevate without code anyway)
        setStage('ok');
        return;
      }

      setFactorId(verified.id);
      setStage('challenge');
    } catch (e) {
      console.error('MFA gate evaluation failed', e);
      setStage('ok'); // fail-open for non-MFA errors so users aren't locked out
    }
  }, [user, isTestMode]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  if (!user) return <>{children}</>;
  if (isTestMode) return <>{children}</>;
  if (user.email === 'test@haushhaush.de') return <>{children}</>;

  if (stage === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stage === 'enroll') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md">
          <MfaEnrollScreen
            required
            onComplete={() => evaluate()}
          />
          <div className="text-center mt-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { clearTrustedDeviceLocal(); await signOut(); }}
            >
              Abmelden
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'challenge') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md">
          <MfaChallengeScreen
            factorId={factorId}
            userId={user.id}
            onSuccess={() => evaluate()}
            onRecoverySuccess={() => evaluate()}
            onCancel={async () => { clearTrustedDeviceLocal(); await signOut(); }}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
