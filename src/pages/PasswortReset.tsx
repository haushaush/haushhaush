import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const logoUrl = import.meta.env.VITE_LOGO_URL || null;

export default function PasswortReset() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase liefert die Recovery-Session per URL-Hash; onAuthStateChange feuert PASSWORD_RECOVERY.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setInvalid(false);
      }
    });
    // Falls die Session schon da ist (z. B. direkter Aufruf mit bestehender Recovery-Session)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const timeout = setTimeout(() => {
      setReady(prev => {
        if (!prev) setInvalid(true);
        return prev;
      });
    }, 5000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Das Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    if (password !== password2) {
      toast.error('Die Passwörter stimmen nicht überein.');
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast.error('Speichern fehlgeschlagen', { description: error.message });
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate('/auth', { replace: true }), 2500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          {logoUrl && (
            <img src={logoUrl} alt="Agency Hub Logo" className="mx-auto mb-4" style={{ maxWidth: '140px', height: 'auto' }} />
          )}
          <h1 className="text-[32px] font-bold text-foreground" style={{ letterSpacing: '-0.03em' }}>
            Agency Hub
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1.5">Haush Haush x Viral Connect</p>
        </div>

        <div className="rounded-2xl border border-border p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]" style={{ backgroundColor: 'hsl(var(--card))' }}>
          <h2 className="text-xl font-semibold text-foreground mb-6">Neues Passwort festlegen</h2>

          {done ? (
            <div className="rounded-xl px-4 py-3 text-sm font-medium border border-success/30 bg-success/10 text-foreground">
              Passwort gespeichert. Du wirst zur Anmeldung weitergeleitet...
            </div>
          ) : invalid ? (
            <div className="space-y-4">
              <div className="rounded-xl px-4 py-3 text-sm font-medium border border-destructive/30 bg-destructive/10 text-foreground">
                Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.
              </div>
              <Button asChild className="w-full h-12 rounded-[10px] text-[15px] font-semibold">
                <Link to="/auth">Zur Anmeldung</Link>
              </Button>
            </div>
          ) : !ready ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Link wird geprüft...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm text-foreground">Neues Passwort</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  required
                  autoComplete="new-password"
                  className="h-12 rounded-[10px] text-[15px] bg-muted/50 border-border focus:border-primary focus:ring-primary/15"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password2" className="text-sm text-foreground">Passwort wiederholen</Label>
                <Input
                  id="new-password2"
                  type="password"
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="h-12 rounded-[10px] text-[15px] bg-muted/50 border-border focus:border-primary focus:ring-primary/15"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-[10px] text-[15px] font-semibold transition-transform active:scale-[0.99]"
                disabled={isLoading}
              >
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gespeichert...</> : 'Passwort speichern'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
