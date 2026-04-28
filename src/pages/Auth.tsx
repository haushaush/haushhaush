import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const logoUrl = import.meta.env.VITE_LOGO_URL || null;
const TEST_EMAIL = 'test@haushhaush.de';
const TEST_PASSWORD = 'Test1234!';

export default function Auth() {
  const { user, loading, activateTestMode } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMsg, setPendingMsg] = useState('');
  const [showTestMode, setShowTestMode] = useState(false);
  const [testPassword, setTestPassword] = useState('');

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-primary animate-pulse text-2xl font-semibold">Laden...</div></div>;
  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setPendingMsg('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error('Login fehlgeschlagen', { description: error.message });
      setIsLoading(false);
      return;
    }

    // Check if user has a pending employee request
    if (data.user) {
      const { data: req } = await supabase
        .from('employee_requests')
        .select('status')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (req && req.status === 'Ausstehend') {
        await supabase.auth.signOut();
        setPendingMsg('Dein Konto wartet auf Freischaltung durch einen Admin.');
        setIsLoading(false);
        return;
      }
      if (req && req.status === 'Abgelehnt') {
        await supabase.auth.signOut();
        setPendingMsg('Deine Anfrage wurde leider abgelehnt. Kontaktiere einen Admin.');
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[400px]">
        {/* Hero */}
        <div className="text-center mb-8">
          {logoUrl && (
            <img src={logoUrl} alt="Agency Hub Logo" className="mx-auto mb-4" style={{ maxWidth: '140px', height: 'auto' }} />
          )}
          <h1 className="text-[32px] font-bold text-foreground" style={{ letterSpacing: '-0.03em' }}>
            Agency Hub
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1.5">Haush Haush x Viral Connect</p>
        </div>

        {/* Pending banner */}
        {pendingMsg && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm font-medium border border-warning/30" style={{ backgroundColor: 'rgba(255,159,10,0.12)', color: 'hsl(var(--foreground))' }}>
            {pendingMsg}
          </div>
        )}

        {/* Auth Card */}
        <div className="rounded-2xl border border-border p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]" style={{ backgroundColor: 'hsl(var(--card))' }}>
          <h2 className="text-xl font-semibold text-foreground mb-6">Anmelden</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-foreground">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@haushhaush.de"
                required
                className="h-12 rounded-[10px] text-[15px] bg-muted/50 border-border focus:border-primary focus:ring-primary/15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-foreground">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-12 rounded-[10px] text-[15px] bg-muted/50 border-border focus:border-primary focus:ring-primary/15"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-[10px] text-[15px] font-semibold transition-transform active:scale-[0.99]"
              disabled={isLoading}
            >
              {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird angemeldet...</> : 'Anmelden'}
            </Button>
          </form>

          <p className="text-center mt-4">
            <button className="text-xs text-muted-foreground hover:text-primary transition-colors" onClick={() => toast.info('Kontaktiere einen Admin für Passwort-Reset.')}>
              Passwort vergessen?
            </button>
          </p>
        </div>


        {/* Test-Zugang (dev) */}
        <div className="mt-4 text-center space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg text-xs"
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true);
              setPendingMsg('');
              const { error } = await supabase.auth.signInWithPassword({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
              });
              setIsLoading(false);
              if (error) {
                if (/invalid login/i.test(error.message)) {
                  toast.error(
                    'Test-Account nicht eingerichtet. Als Admin einloggen → Einstellungen → Sicherheit → Dev-Tools → "Test-Account zurücksetzen".',
                    { duration: 8000 },
                  );
                } else {
                  toast.error('Login fehlgeschlagen: ' + error.message);
                }
                return;
              }
              toast.success('Eingeloggt als Test Admin ✓');
              navigate('/uebersicht');
            }}
          >
            <FlaskConical className="h-3 w-3 mr-1.5" />
            🧪 Test-Zugang
          </Button>

          <div>
            <button
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              onClick={() => setShowTestMode(prev => !prev)}
            >
              Legacy Test Mode
            </button>
            {showTestMode && (
              <div className="mt-2 rounded-xl border border-border p-3" style={{ backgroundColor: 'hsl(var(--card))' }}>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={testPassword}
                    onChange={e => setTestPassword(e.target.value)}
                    placeholder="Test-Passwort"
                    className="h-8 text-xs rounded-lg"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    onClick={() => {
                      const ok = activateTestMode(testPassword);
                      if (ok) toast.success('Test Mode aktiviert ✓');
                      else toast.error('Falsches Passwort');
                    }}
                  >
                    Unlock
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
