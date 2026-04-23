import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, X, ShieldCheck, Info, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const KRANKENKASSEN = [
  'Techniker Krankenkasse (TK)', 'AOK', 'Barmer', 'DAK-Gesundheit',
  'IKK classic', 'HKK', 'Knappschaft', 'mkk - meine krankenkasse',
  'BKK', 'SBK Siemens-Betriebskrankenkasse', 'Sonstige',
];

interface PwRule { label: string; ok: boolean }

function evaluatePassword(pw: string): { rules: PwRule[]; score: number } {
  const rules: PwRule[] = [
    { label: 'Mindestens 8 Zeichen', ok: pw.length >= 8 },
    { label: 'Großbuchstabe', ok: /[A-Z]/.test(pw) },
    { label: 'Kleinbuchstabe', ok: /[a-z]/.test(pw) },
    { label: 'Zahl', ok: /[0-9]/.test(pw) },
    { label: 'Sonderzeichen (@#$%&*!?)', ok: /[@#$%&*!?]/.test(pw) },
  ];
  const score = rules.filter(r => r.ok).length;
  return { rules, score };
}

const STRENGTH_COLORS = ['bg-destructive', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-600'];
const STRENGTH_LABELS = ['sehr schwach', 'schwach', 'mittel', 'stark', 'sehr stark'];

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [vorname, setVorname] = useState('');

  // Step 1
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submittingPw, setSubmittingPw] = useState(false);

  // Step 2
  const [s2, setS2] = useState({
    geburtsdatum: '', geburtsort: '', staatsangehoerigkeit: 'Deutsch',
    familienstand: '', kinder_anzahl: 0, konfession: '',
    adresse_strasse: '', adresse_plz: '', adresse_ort: '', adresse_land: 'Deutschland',
    notfallkontakt_name: '', notfallkontakt_telefon: '', notfallkontakt_beziehung: '',
  });

  // Step 3
  const [s3, setS3] = useState({
    iban: '', bic: '', bank_name: '',
    steuer_id: '', steuerklasse: '1',
    rentenversicherungsnummer: '', sozialversicherungsnummer: '',
    krankenkasse: '', krankenversicherung_nummer: '',
  });
  const [submittingFinal, setSubmittingFinal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (user) {
      const fullName = (user.user_metadata?.full_name || '') as string;
      setVorname(fullName.split(' ')[0] || 'da');
    }
  }, [user, authLoading, navigate]);

  // Block back/refresh during onboarding step 1
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (step === 1) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step]);

  const { rules, score } = useMemo(() => evaluatePassword(newPw), [newPw]);
  const matches = newPw.length > 0 && newPw === confirmPw;
  const notSameAsOld = newPw.length > 0 && newPw !== currentPw;
  const canSubmitPw = score === 5 && matches && notSameAsOld && currentPw.length > 0;

  async function submitPassword() {
    if (!canSubmitPw || !user) return;
    setSubmittingPw(true);
    try {
      // Re-auth with current password to ensure correctness
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPw,
      });
      if (signInErr) {
        toast.error('Aktuelles Passwort ist falsch');
        setSubmittingPw(false);
        return;
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPw });
      if (updErr) {
        toast.error(`Passwort konnte nicht geändert werden: ${updErr.message}`);
        setSubmittingPw(false);
        return;
      }

      const passwordChangedAt = new Date().toISOString();
      const { data: teamData, error: teamErr } = await supabase
        .from('team')
        .update({ must_change_password: false, password_changed_at: passwordChangedAt })
        .eq('id', user.id)
        .select('must_change_password, onboarding_completed_at')
        .single();

      if (teamErr) {
        toast.error(`Fehler beim Speichern: ${teamErr.message}`);
        setSubmittingPw(false);
        return;
      }

      queryClient.setQueryData(['team-onboarding-self', user.id], teamData);
      await queryClient.invalidateQueries({ queryKey: ['team-onboarding-self', user.id] });
      await queryClient.refetchQueries({ queryKey: ['team-onboarding-self', user.id], type: 'active' });

      toast.success('Passwort erfolgreich geändert');
      setStep(2);
    } finally {
      setSubmittingPw(false);
    }
  }

  async function finishOnboarding() {
    if (!user) return;
    setSubmittingFinal(true);
    try {
      // Build HR payload from optional fields (only non-empty)
      const hrPayload: Record<string, unknown> = { user_id: user.id, updated_by: user.id };
      Object.entries(s2).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) hrPayload[k] = v;
      });
      Object.entries(s3).forEach(([k, v]) => {
        if (k === 'steuerklasse') {
          if (v) hrPayload[k] = parseInt(v as string, 10);
        } else if (v !== '' && v !== null && v !== undefined) {
          hrPayload[k] = v;
        }
      });

      const hasAnyField = Object.keys(hrPayload).length > 2;
      if (hasAnyField) {
        const { error: hrErr } = await supabase
          .from('team_hr_data')
          .upsert(hrPayload as never, { onConflict: 'user_id' });
        if (hrErr) {
          console.error('hr upsert error', hrErr);
          toast.error('HR-Daten konnten nicht gespeichert werden');
          setSubmittingFinal(false);
          return;
        }
      }

      const { error: teamErr } = await supabase
        .from('team')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', user.id);
      if (teamErr) console.error('team onboarding update', teamErr);

      setStep(4);
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } finally {
      setSubmittingFinal(false);
    }
  }

  async function skipRemaining() {
    if (!user) return;
    setSubmittingFinal(true);
    try {
      await supabase
        .from('team')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', user.id);
      setStep(4);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } finally {
      setSubmittingFinal(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-[520px]">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Willkommen, {vorname}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lass uns dein Konto einrichten
          </p>
        </div>

        {/* Progress */}
        {step < 4 && (
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map(n => (
              <div
                key={n}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  step >= n ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>
        )}

        <Card className="p-6 sm:p-8 shadow-lg border-border/60">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Neues Passwort festlegen</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Dein temporäres Passwort wurde von einem Administrator gesetzt.
                  Bitte lege jetzt ein eigenes Passwort fest.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="currentPw">Aktuelles Passwort</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="currentPw"
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Passwort ein-/ausblenden"
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="newPw">Neues Passwort</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="newPw"
                      type={showNew ? 'text' : 'password'}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Passwort ein-/ausblenden"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPw && (
                    <>
                      <div className="flex gap-1 mt-2">
                        {[0, 1, 2, 3, 4].map(i => (
                          <div
                            key={i}
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors',
                              i < score ? STRENGTH_COLORS[score - 1] : 'bg-muted',
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Stärke: {STRENGTH_LABELS[Math.max(0, score - 1)] || 'sehr schwach'}
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <Label htmlFor="confirmPw">Neues Passwort bestätigen</Label>
                  <Input
                    id="confirmPw"
                    type={showNew ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="mt-1.5"
                    autoComplete="new-password"
                  />
                  {confirmPw && !matches && (
                    <p className="text-xs text-destructive mt-1">Passwörter stimmen nicht überein</p>
                  )}
                </div>

                {newPw && (
                  <ul className="space-y-1 pt-1">
                    {rules.map(r => (
                      <li key={r.label} className="flex items-center gap-2 text-xs">
                        {r.ok ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className={r.ok ? 'text-foreground' : 'text-muted-foreground'}>
                          {r.label}
                        </span>
                      </li>
                    ))}
                    {newPw && currentPw && !notSameAsOld && (
                      <li className="flex items-center gap-2 text-xs text-destructive">
                        <X className="h-3.5 w-3.5" />
                        Neues Passwort darf nicht mit dem alten übereinstimmen
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <Button
                onClick={submitPassword}
                disabled={!canSubmitPw || submittingPw}
                className="w-full"
              >
                {submittingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Weiter →
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Persönliche Daten</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Diese Infos helfen der Buchhaltung. Du kannst sie auch später im Profil ergänzen.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Geburtsdatum</Label>
                  <Input type="date" value={s2.geburtsdatum} onChange={(e) => setS2({ ...s2, geburtsdatum: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Geburtsort</Label>
                  <Input value={s2.geburtsort} onChange={(e) => setS2({ ...s2, geburtsort: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Staatsangehörigkeit</Label>
                  <Input value={s2.staatsangehoerigkeit} onChange={(e) => setS2({ ...s2, staatsangehoerigkeit: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Familienstand</Label>
                  <Select value={s2.familienstand} onValueChange={(v) => setS2({ ...s2, familienstand: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ledig">Ledig</SelectItem>
                      <SelectItem value="verheiratet">Verheiratet</SelectItem>
                      <SelectItem value="geschieden">Geschieden</SelectItem>
                      <SelectItem value="verwitwet">Verwitwet</SelectItem>
                      <SelectItem value="eingetragene_lebenspartnerschaft">Eingetragene Lebenspartnerschaft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Anzahl Kinder</Label>
                  <Input type="number" min={0} value={s2.kinder_anzahl} onChange={(e) => setS2({ ...s2, kinder_anzahl: parseInt(e.target.value || '0', 10) })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Konfession</Label>
                  <Select value={s2.konfession} onValueChange={(v) => setS2({ ...s2, konfession: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keine">Keine</SelectItem>
                      <SelectItem value="roemisch-katholisch">Römisch-katholisch</SelectItem>
                      <SelectItem value="evangelisch">Evangelisch</SelectItem>
                      <SelectItem value="sonstige">Sonstige</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-sm font-medium mb-2">Adresse</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Straße & Hausnummer</Label>
                    <Input value={s2.adresse_strasse} onChange={(e) => setS2({ ...s2, adresse_strasse: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>PLZ</Label>
                    <Input value={s2.adresse_plz} onChange={(e) => setS2({ ...s2, adresse_plz: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Ort</Label>
                    <Input value={s2.adresse_ort} onChange={(e) => setS2({ ...s2, adresse_ort: e.target.value })} className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label>Land</Label>
                    <Input value={s2.adresse_land} onChange={(e) => setS2({ ...s2, adresse_land: e.target.value })} className="mt-1.5" />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-sm font-medium mb-2">Notfallkontakt</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={s2.notfallkontakt_name} onChange={(e) => setS2({ ...s2, notfallkontakt_name: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={s2.notfallkontakt_telefon} onChange={(e) => setS2({ ...s2, notfallkontakt_telefon: e.target.value })} className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label>Beziehung</Label>
                    <Input placeholder="z.B. Partner, Mutter, Bruder" value={s2.notfallkontakt_beziehung} onChange={(e) => setS2({ ...s2, notfallkontakt_beziehung: e.target.value })} className="mt-1.5" />
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(3)}>Überspringen</Button>
                <Button onClick={() => setStep(3)}>Weiter →</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Bankdaten & Steuer</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Nötig für Gehaltszahlungen und Lohnsteuer. Alles optional — kannst du später ergänzen.
                </p>
              </div>

              <div className="pt-1">
                <h3 className="text-sm font-medium mb-2">Bankverbindung</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>IBAN</Label>
                    <Input placeholder="DE…" value={s3.iban} onChange={(e) => setS3({ ...s3, iban: e.target.value.toUpperCase() })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>BIC</Label>
                    <Input value={s3.bic} onChange={(e) => setS3({ ...s3, bic: e.target.value.toUpperCase() })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Bank</Label>
                    <Input value={s3.bank_name} onChange={(e) => setS3({ ...s3, bank_name: e.target.value })} className="mt-1.5" />
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <h3 className="text-sm font-medium mb-2">Steuer & Versicherung</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Steuer-ID</Label>
                    <Input maxLength={11} value={s3.steuer_id} onChange={(e) => setS3({ ...s3, steuer_id: e.target.value.replace(/\D/g, '') })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Steuerklasse</Label>
                    <Select value={s3.steuerklasse} onValueChange={(v) => setS3({ ...s3, steuerklasse: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6].map(n => (
                          <SelectItem key={n} value={String(n)}>Klasse {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Rentenversicherungsnummer</Label>
                    <Input placeholder="11 111111 A 111" value={s3.rentenversicherungsnummer} onChange={(e) => setS3({ ...s3, rentenversicherungsnummer: e.target.value })} className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label>Sozialversicherungsnummer (optional)</Label>
                    <Input value={s3.sozialversicherungsnummer} onChange={(e) => setS3({ ...s3, sozialversicherungsnummer: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Krankenkasse</Label>
                    <Select value={s3.krankenkasse} onValueChange={(v) => setS3({ ...s3, krankenkasse: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                      <SelectContent>
                        {KRANKENKASSEN.map(k => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Versicherungsnummer</Label>
                    <Input value={s3.krankenversicherung_nummer} onChange={(e) => setS3({ ...s3, krankenversicherung_nummer: e.target.value })} className="mt-1.5" />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Deine Daten sind verschlüsselt und nur für dich, Admins und die Buchhaltung einsehbar.
                </p>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={skipRemaining} disabled={submittingFinal}>
                  Überspringen
                </Button>
                <Button onClick={finishOnboarding} disabled={submittingFinal}>
                  {submittingFinal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Fertig →
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="py-8 flex flex-col items-center text-center animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <h2 className="text-xl font-semibold">Dein Konto ist bereit!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Du wirst jetzt zum Dashboard weitergeleitet…
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
