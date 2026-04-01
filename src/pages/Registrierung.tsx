import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Loader2, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';

const ABTEILUNGEN = ['Sales', 'Fulfillment', 'Customer Success', 'Management', 'Intern', 'Sonstiges'];
const VERTRAGSARTEN = ['Festangestellt', 'Werkvertrag', 'Minijob', 'Praktikant', 'Sonstiges'];

export default function Registrierung() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    vorname: '', nachname: '', email: '', passwort: '', passwortConfirm: '', telefon: '', geburtsdatum: '',
    position: '', abteilung: '', startdatum: '', vertragsart: '', ueber_mich: '',
    notfall_name: '', notfall_telefon: '', adresse: '', iban: '', datenschutz: false,
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Bild darf max. 5MB groß sein.'); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const validateStep1 = () => {
    if (!form.vorname || !form.nachname || !form.email || !form.passwort || !form.passwortConfirm) {
      toast.error('Bitte alle Pflichtfelder ausfüllen.'); return false;
    }
    if (form.passwort.length < 8) { toast.error('Passwort muss mindestens 8 Zeichen haben.'); return false; }
    if (form.passwort !== form.passwortConfirm) { toast.error('Passwörter stimmen nicht überein.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.position || !form.abteilung) { toast.error('Position und Abteilung sind Pflicht.'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!form.datenschutz) { toast.error('Bitte Datenschutz bestätigen.'); return; }
    setIsLoading(true);

    // 1. Create auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.passwort,
      options: { emailRedirectTo: window.location.origin, data: { full_name: `${form.vorname} ${form.nachname}` } },
    });

    if (authErr) { toast.error(authErr.message); setIsLoading(false); return; }

    const userId = authData.user?.id;

    // 2. Upload avatar if any
    let profilbild_url: string | null = null;
    if (avatarFile && userId) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        profilbild_url = urlData.publicUrl;
      }
    }

    // 3. Insert employee request
    const { error: reqErr } = await supabase.from('employee_requests').insert({
      user_id: userId,
      vorname: form.vorname,
      nachname: form.nachname,
      email: form.email,
      telefon: form.telefon || null,
      geburtsdatum: form.geburtsdatum || null,
      position: form.position,
      abteilung: form.abteilung,
      vertragsart: form.vertragsart || null,
      startdatum: form.startdatum || null,
      ueber_mich: form.ueber_mich || null,
      notfall_name: form.notfall_name || null,
      notfall_telefon: form.notfall_telefon || null,
      adresse: form.adresse || null,
      iban: form.iban || null,
      profilbild_url,
    });

    if (reqErr) { toast.error('Fehler beim Speichern: ' + reqErr.message); setIsLoading(false); return; }

    // Sign out immediately so they can't access the app
    await supabase.auth.signOut();
    setSuccess(true);
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="w-full max-w-[400px] text-center">
          <svg width="80" height="80" viewBox="0 0 80 80" className="mx-auto mb-6" aria-hidden="true">
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                .check-circle { stroke-dasharray: 200; stroke-dashoffset: 200; animation: drawCheck 0.8s ease-out forwards; }
                @keyframes drawCheck { to { stroke-dashoffset: 0; } }
              }
            `}</style>
            <circle cx="40" cy="40" r="36" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" className="check-circle" />
            <path d="M24 40 L35 51 L56 30" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" className="check-circle" />
          </svg>
          <h2 className="text-2xl font-bold text-foreground mb-2">Anfrage gesendet! 🎉</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Dein Profil wurde erstellt. Ein Admin wird deine Anfrage in Kürze überprüfen.
            Du erhältst eine E-Mail sobald dein Zugang freigeschaltet wurde.
          </p>
          <Button onClick={() => navigate('/auth')} className="rounded-[10px] h-12 w-full">
            Zurück zum Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[440px]">
        {/* Back link */}
        <button onClick={() => navigate('/auth')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Zurück zum Login
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-2.5 rounded-full transition-all ${s === step ? 'w-8 bg-primary' : s < step ? 'w-2.5 bg-primary/40' : 'w-2.5 bg-border'}`} />
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]" style={{ backgroundColor: 'hsl(var(--card))' }}>
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Profil anlegen</h2>
                <p className="text-sm text-muted-foreground mt-1">Schritt 1 von 3 — Deine Infos</p>
              </div>

              {/* Avatar */}
              <div className="flex justify-center">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-24 w-24 rounded-full border-2 border-dashed border-primary/40 hover:border-primary flex items-center justify-center overflow-hidden transition-colors"
                  aria-label="Profilbild hochladen"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Vorschau" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-6 w-6 text-primary/60" />
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Vorname *</Label><Input value={form.vorname} onChange={e => set('vorname', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
                <div><Label>Nachname *</Label><Input value={form.nachname} onChange={e => set('nachname', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              </div>
              <div><Label>E-Mail *</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@haushhaush.de" className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Passwort *</Label><Input type="password" value={form.passwort} onChange={e => set('passwort', e.target.value)} placeholder="Min. 8 Zeichen" className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
                <div><Label>Bestätigen *</Label><Input type="password" value={form.passwortConfirm} onChange={e => set('passwortConfirm', e.target.value)} placeholder="••••••••" className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Telefon</Label><Input type="tel" value={form.telefon} onChange={e => set('telefon', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
                <div><Label>Geburtsdatum</Label><Input type="date" value={form.geburtsdatum} onChange={e => set('geburtsdatum', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              </div>

              <Button onClick={() => validateStep1() && setStep(2)} className="w-full h-12 rounded-[10px] font-semibold">Weiter →</Button>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Deine Rolle</h2>
                <p className="text-sm text-muted-foreground mt-1">Schritt 2 von 3 — Berufliche Infos</p>
              </div>

              <div><Label>Position / Jobtitel *</Label><Input value={form.position} onChange={e => set('position', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              <div>
                <Label>Abteilung *</Label>
                <Select value={form.abteilung} onValueChange={v => set('abteilung', v)}>
                  <SelectTrigger className="mt-1 h-12 rounded-[10px] bg-muted/50"><SelectValue placeholder="Abteilung wählen" /></SelectTrigger>
                  <SelectContent>{ABTEILUNGEN.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Startdatum</Label><Input type="date" value={form.startdatum} onChange={e => set('startdatum', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              <div>
                <Label>Vertragsart</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {VERTRAGSARTEN.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set('vertragsart', v)}
                      className={`px-3 py-2 rounded-lg text-sm border transition-colors ${form.vertragsart === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Über mich <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  value={form.ueber_mich}
                  onChange={e => set('ueber_mich', e.target.value.slice(0, 200))}
                  placeholder="Kurze Beschreibung zu dir und deiner Rolle..."
                  className="mt-1 rounded-[10px] bg-muted/50 min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{form.ueber_mich.length}/200</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12 rounded-[10px]">← Zurück</Button>
                <Button onClick={() => validateStep2() && setStep(3)} className="flex-1 h-12 rounded-[10px] font-semibold">Weiter →</Button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Letzte Details</h2>
                <p className="text-sm text-muted-foreground mt-1">Schritt 3 von 3 — Diese Infos sind nur intern sichtbar.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Notfall-Kontakt Name</Label><Input value={form.notfall_name} onChange={e => set('notfall_name', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
                <div><Label>Notfall-Kontakt Tel.</Label><Input type="tel" value={form.notfall_telefon} onChange={e => set('notfall_telefon', e.target.value)} className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              </div>
              <div><Label>Adresse</Label><Input value={form.adresse} onChange={e => set('adresse', e.target.value)} placeholder="Straße, PLZ, Stadt" className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>
              <div><Label>IBAN</Label><Input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="DE89 3704 0044 ..." className="mt-1 h-12 rounded-[10px] bg-muted/50" /></div>

              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="datenschutz"
                  checked={form.datenschutz}
                  onCheckedChange={v => set('datenschutz', !!v)}
                  className="mt-0.5"
                />
                <label htmlFor="datenschutz" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                  Ich stimme zu, dass meine Daten intern für HR-Zwecke gespeichert werden.
                </label>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1 h-12 rounded-[10px]">← Zurück</Button>
                <Button onClick={handleSubmit} disabled={isLoading} className="flex-1 h-12 rounded-[10px] font-semibold">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gesendet...</> : 'Bewerbung absenden'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
