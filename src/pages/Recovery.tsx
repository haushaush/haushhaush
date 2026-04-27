import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ShieldAlert, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface RecoveryResult {
  ok?: boolean;
  message?: string;
  error?: string;
  user_id?: string;
  email?: string;
  report?: { steps?: string[] };
}

export default function Recovery() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('admin@haushhaush.de');
  const [newPassword, setNewPassword] = useState('');
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRecover = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recover-admin-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            recoveryToken: token,
            adminEmail: email,
            newPassword: newPassword || undefined,
          }),
        },
      );

      const data: RecoveryResult = await response.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    } finally {
      setLoading(false);
    }
  };

  const isError = !!result?.error;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Admin Recovery</h1>
            <p className="text-sm text-muted-foreground">
              Notfall-Wiederherstellung für gesperrte Admin-Accounts.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">Recovery Token</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token aus Cloud-Secret RECOVERY_TOKEN"
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Admin E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Neues Passwort (optional)</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leer lassen, wenn nur Profil repariert werden soll"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Wenn der User in auth.users fehlt, ist Passwort PFLICHT.
            </p>
          </div>

          <Button
            onClick={handleRecover}
            disabled={loading || !token}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Recovery läuft…
              </>
            ) : (
              'Recovery starten'
            )}
          </Button>
        </div>

        {result && (
          <div
            className={`rounded-lg border p-4 space-y-3 ${
              isError
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-success/30 bg-success/5'
            }`}
          >
            <div className="flex items-start gap-2">
              {isError ? (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    isError ? 'text-destructive' : 'text-success'
                  }`}
                >
                  {isError ? 'Fehler' : result.message || 'Erfolg'}
                </p>
                {isError && (
                  <p className="text-sm text-foreground/80 mt-1">{result.error}</p>
                )}
                {result.email && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.email} {result.user_id ? `· ${result.user_id}` : ''}
                  </p>
                )}
              </div>
            </div>

            {result.report?.steps && result.report.steps.length > 0 && (
              <div className="space-y-1 pl-7">
                {result.report.steps.map((s, i) => (
                  <p key={i} className="text-xs text-foreground/80 font-mono">
                    • {s}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Diese Seite ist nicht in der Navigation verlinkt und nur per direkter URL erreichbar.
        </p>
      </Card>
    </div>
  );
}
