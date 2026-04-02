import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Camera, Trash2, Lock, ChevronDown, ChevronUp } from 'lucide-react';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export default function Profil() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [showIban, setShowIban] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  const [form, setForm] = useState({
    vorname: '',
    nachname: '',
    email: '',
    telefon: '',
    geburtsdatum: '',
    ueber_mich: '',
    position: '',
    abteilung: '',
    startdatum: '',
    notfall_name: '',
    notfall_telefon: '',
    iban: '',
  });

  useEffect(() => {
    if (!user?.id) return;
    const fetchProfile = async () => {
      // Try employee_requests first for detailed data
      const { data: req } = await supabase
        .from('employee_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'Genehmigt')
        .maybeSingle();

      // Also get team member data
      const { data: team } = await supabase
        .from('team')
        .select('*')
        .eq('email', user.email || '')
        .maybeSingle();

      if (req) {
        setForm({
          vorname: req.vorname || '',
          nachname: req.nachname || '',
          email: req.email || user.email || '',
          telefon: req.telefon || '',
          geburtsdatum: req.geburtsdatum || '',
          ueber_mich: req.ueber_mich || '',
          position: req.position || '',
          abteilung: req.abteilung || '',
          startdatum: req.startdatum || '',
          notfall_name: req.notfall_name || '',
          notfall_telefon: req.notfall_telefon || '',
          iban: req.iban || '',
        });
        setAvatarUrl(req.profilbild_url || null);
      } else if (team) {
        const nameParts = team.name.split(' ');
        setForm(prev => ({
          ...prev,
          vorname: nameParts[0] || '',
          nachname: nameParts.slice(1).join(' ') || '',
          email: team.email || user.email || '',
          abteilung: team.department || '',
          startdatum: team.startdatum || '',
          position: String(team.rolle || ''),
        }));
      } else {
        setForm(prev => ({
          ...prev,
          email: user.email || '',
          vorname: (user.email || '').split('@')[0],
        }));
      }

      setAvatarUrl(user.user_metadata?.avatar_url || null);
      setLoading(false);
    };
    fetchProfile();
  }, [user?.id, user?.email]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Datei zu groß (max. 5 MB)');
      return;
    }

    const ext = file.name.split('.').pop();
    const path = `${user.id}/profile.${ext}`;

    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) {
      toast.error('Upload fehlgeschlagen');
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(urlData.publicUrl + '?t=' + Date.now());
    toast.success('Profilbild aktualisiert ✓');
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id) return;
    const { error } = await supabase.storage.from('avatars').remove([`${user.id}/profile.png`, `${user.id}/profile.jpg`, `${user.id}/profile.jpeg`]);
    if (!error) {
      setAvatarUrl(null);
      toast.success('Profilbild entfernt');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update employee_requests if exists
      const { data: existing } = await supabase
        .from('employee_requests')
        .select('id')
        .eq('user_id', user?.id || '')
        .eq('status', 'Genehmigt')
        .maybeSingle();

      if (existing) {
        await supabase.from('employee_requests').update({
          vorname: form.vorname,
          nachname: form.nachname,
          telefon: form.telefon,
          geburtsdatum: form.geburtsdatum || null,
          ueber_mich: form.ueber_mich,
          position: form.position,
          notfall_name: form.notfall_name,
          notfall_telefon: form.notfall_telefon,
          iban: form.iban,
          profilbild_url: avatarUrl,
        }).eq('id', existing.id);
      }

      toast.success('Profil gespeichert ✓');
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
      toast.error('Passwörter stimmen nicht überein');
      return;
    }
    if (passwords.new.length < 8) {
      toast.error('Mindestens 8 Zeichen erforderlich');
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.new });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Passwort aktualisiert ✓');
      setPasswordOpen(false);
      setPasswords({ current: '', new: '', confirm: '' });
    }
    setChangingPassword(false);
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const displayName = `${form.vorname} ${form.nachname}`.trim() || 'Benutzer';

  if (loading) {
    return (
      <div className="max-w-[600px] mx-auto py-10 space-y-6">
        <div className="h-8 w-48 animate-pulse bg-muted rounded" />
        <div className="h-4 w-64 animate-pulse bg-muted rounded" />
        <div className="h-[400px] animate-pulse bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-[600px] mx-auto py-6 sm:py-10 px-4 sm:px-0">
      <h1 className="text-2xl font-bold text-foreground">Mein Profil</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-8">Verwalte deine persönlichen Informationen</p>

      {/* Avatar Section */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative group">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
        </div>
        <div className="space-y-1">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Bild ändern
          </Button>
          {avatarUrl && (
            <button onClick={handleRemoveAvatar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-3 w-3" /> Entfernen
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      </div>

      {/* Form Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        {/* Personal */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Persönliche Infos</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vorname</Label>
              <Input value={form.vorname} onChange={e => updateField('vorname', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nachname</Label>
              <Input value={form.nachname} onChange={e => updateField('nachname', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">E-Mail</Label>
            <Input value={form.email} disabled className="opacity-60" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telefon</Label>
              <Input type="tel" value={form.telefon} onChange={e => updateField('telefon', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Geburtsdatum</Label>
              <Input type="date" value={form.geburtsdatum} onChange={e => updateField('geburtsdatum', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Über mich</Label>
            <Textarea
              value={form.ueber_mich}
              onChange={e => updateField('ueber_mich', e.target.value.slice(0, 200))}
              maxLength={200}
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground text-right">{form.ueber_mich.length}/200</p>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Professional */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Berufliches</h3>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Position / Jobtitel</Label>
            <Input value={form.position} onChange={e => updateField('position', e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Abteilung</Label>
              <Badge variant="secondary" className="text-xs">{form.abteilung || '–'}</Badge>
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Startdatum</Label>
              <p className="text-sm text-foreground">{form.startdatum ? new Date(form.startdatum).toLocaleDateString('de-DE') : '–'}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Security */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Sicherheit</h3>
          <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Lock className="h-3.5 w-3.5" /> Passwort ändern
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Passwort ändern</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Neues Passwort</Label>
                  <Input type="password" value={passwords.new} onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))} placeholder="Min. 8 Zeichen" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Passwort bestätigen</Label>
                  <Input type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
                </div>
                <Button onClick={handlePasswordChange} disabled={changingPassword} className="w-full">
                  {changingPassword ? 'Wird aktualisiert...' : 'Passwort aktualisieren'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="border-t border-border" />

        {/* Emergency & Bank */}
        <div className="space-y-4">
          <button
            onClick={() => setShowEmergency(!showEmergency)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {showEmergency ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Notfall & Bankdaten
          </button>
          {showEmergency && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Notfall-Kontakt Name</Label>
                  <Input value={form.notfall_name} onChange={e => updateField('notfall_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Notfall-Kontakt Telefon</Label>
                  <Input type="tel" value={form.notfall_telefon} onChange={e => updateField('notfall_telefon', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">IBAN</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showIban ? 'text' : 'password'}
                    value={form.iban}
                    onChange={e => updateField('iban', e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setShowIban(!showIban)} className="text-xs shrink-0">
                    {showIban ? 'Verbergen' : 'Anzeigen'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full mt-6 h-11">
        {saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
      </Button>
    </div>
  );
}
