import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', rolle: 'Setter' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name }, emailRedirectTo: window.location.origin }
    });
    if (authError) { setError(authError.message); setLoading(false); return; }

    await supabase.from('team').insert({
      name: form.name,
      email: form.email,
      rolle: form.rolle as any,
      department: form.rolle === 'Closer' ? 'Closer' : 'Setter',
      startdatum: new Date().toISOString().split('T')[0],
    });

    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-heading font-bold">Mitarbeiter registrieren</h1>
          <p className="text-sm text-muted-foreground mt-1">Erstelle deinen Account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reg-name">Name</Label>
            <Input id="reg-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="reg-email">E-Mail</Label>
            <Input id="reg-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <Label htmlFor="reg-pw">Passwort</Label>
            <Input id="reg-pw" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
          </div>
          <div>
            <Label htmlFor="reg-rolle">Rolle</Label>
            <select
              id="reg-rolle"
              value={form.rolle}
              onChange={e => setForm({ ...form, rolle: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="Setter">Setter</option>
              <option value="Closer">Closer</option>
              <option value="Account-Manager">Account-Manager</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full min-h-[44px]" disabled={loading}>
            {loading ? 'Wird registriert...' : 'Registrieren'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Bereits registriert?{' '}
          <button onClick={() => navigate('/auth')} className="text-primary hover:underline font-medium">
            Anmelden
          </button>
        </p>
      </div>
    </div>
  );
}
