import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Eye, EyeOff, Wand2, Copy, Mail, Check, Loader2, Info, ChevronDown, ChevronUp,
  UserPlus, Shield, X, Minus,
} from 'lucide-react';
import { toast } from 'sonner';

import { DEPARTMENT_OPTIONS, MITARBEITER_TYP_OPTIONS } from '@/constants/team';

type Rolle = 'admin' | 'account-manager' | 'setter';

const ABTEILUNGEN = DEPARTMENT_OPTIONS;

const POSITIONEN = [
  'CEO', 'Head of Fulfillment', 'Head of Sales', 'Head of Development',
  'Business Strategy', 'Customer Success', 'Foto & Video', 'Development',
  'Account Setup', 'Grafikdesign', 'Setting', 'Mail Marketing', 'Webdesign',
  'Vorqualifikation', 'Cold Calling', 'Media Buying', 'Buchhaltung', 'Closer', 'Setter',
];

const ROLE_LABELS: Record<Rolle, string> = {
  setter: 'Mitarbeiter',
  'account-manager': 'Account-Manager',
  admin: 'Admin',
};

const ROLE_HINTS: Record<Rolle, string> = {
  setter: 'Standard-Mitarbeiter mit Basisrechten (Dashboard, Kunden ansehen, Projekte, Aufgaben, Drive, Zeiterfassung).',
  'account-manager': 'Erweiterte Rechte: bearbeitet Kunden & Projekte, sieht Sales-Bereiche und Tools.',
  admin: 'Voller Zugriff auf alle Bereiche inkl. Team- und Berechtigungsverwaltung.',
};

interface AppPermission {
  permission_key: string;
  label: string;
  category: string;
  description: string | null;
}
interface RolePermission { role: string; permission_key: string; }
type OverrideMode = 'inherit' | 'allow' | 'deny';

function generatePassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const nums = '23456789';
  const syms = '!@#$%&*?';
  const all = upper + lower + nums + syms;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(nums) + pick(syms);
  for (let i = 4; i < length; i++) pwd += pick(all);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pwd) return { score: 0, label: '—', color: 'bg-muted' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd)) score++;
  if (pwd.length >= 12 && /[!@#$%^&*?_-]/.test(pwd)) score++;
  const map = [
    { label: 'Schwach', color: 'bg-destructive' },
    { label: 'OK', color: 'bg-warning' },
    { label: 'Gut', color: 'bg-warning' },
    { label: 'Stark', color: 'bg-primary' },
  ];
  return { score: score as 0 | 1 | 2 | 3, ...map[score] };
}

function initials(vorname: string, nachname: string) {
  return ((vorname[0] || '') + (nachname[0] || '')).toUpperCase() || '–';
}

export function CreateTeamMemberTab() {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [telefon, setTelefon] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [abteilung, setAbteilung] = useState<string>('');
  const [position, setPosition] = useState<string>('');
  const [rolle, setRolle] = useState<Rolle>('setter');
  const [mitarbeiterTyp, setMitarbeiterTyp] = useState<string>('');
  const [startdatum, setStartdatum] = useState(new Date().toISOString().slice(0, 10));
  const [avatarUrl, setAvatarUrl] = useState('');
  const [notizen, setNotizen] = useState('');
  const [extraOpen, setExtraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string; email: string; password: string } | null>(null);

  // Permission-System
  const [allPerms, setAllPerms] = useState<AppPermission[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({}); // permission_key -> granted
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setPermsLoading(true);
      const [a, r] = await Promise.all([
        supabase.from('app_permissions' as any).select('permission_key,label,category,description').order('category').order('label'),
        supabase.from('role_permissions' as any).select('role,permission_key'),
      ]);
      setAllPerms(((a.data as any) || []) as AppPermission[]);
      setRolePerms(((r.data as any) || []) as RolePermission[]);
      setPermsLoading(false);
    })();
  }, []);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const roleGrantedKeys = useMemo(() => {
    const keys = new Set<string>();
    if (rolle === 'admin') {
      // Admin = alle Rechte effektiv (über has_role-Bypass), trotzdem hier markieren
      allPerms.forEach(p => keys.add(p.permission_key));
    } else {
      rolePerms.filter(r => r.role === rolle).forEach(r => keys.add(r.permission_key));
    }
    return keys;
  }, [rolePerms, rolle, allPerms]);

  const grouped = useMemo(() => {
    return allPerms.reduce<Record<string, AppPermission[]>>((acc, p) => {
      (acc[p.category] ||= []).push(p);
      return acc;
    }, {});
  }, [allPerms]);

  const effectiveActive = (key: string) => {
    if (key in overrides) return overrides[key];
    return roleGrantedKeys.has(key);
  };

  const validateEmail = (val: string) => {
    if (!val) { setEmailError(''); return; }
    const ok = /^[^\s@]+@(viralconnect\.de|haushhaush\.de)$/i.test(val.trim());
    setEmailError(ok ? '' : 'Nur @viralconnect.de oder @haushhaush.de erlaubt');
  };

  const handleRolleChange = (r: Rolle) => {
    setRolle(r);
    // Overrides bleiben – sie sind explizite Abweichungen. User kann sie zurücksetzen.
  };

  const setMode = (permission_key: string, mode: OverrideMode) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (mode === 'inherit') delete next[permission_key];
      else next[permission_key] = mode === 'allow';
      return next;
    });
  };

  const resetForm = () => {
    setVorname(''); setNachname(''); setEmail(''); setEmailError(''); setTelefon('');
    setPassword(''); setPasswordConfirm(''); setShowPassword(false);
    setAbteilung(''); setPosition(''); setRolle('setter'); setMitarbeiterTyp('');
    setStartdatum(new Date().toISOString().slice(0, 10));
    setOverrides({}); setAdvancedOpen(false);
    setAvatarUrl(''); setNotizen(''); setExtraOpen(false);
  };

  const handleSubmit = async () => {
    if (!vorname.trim() || !nachname.trim()) return toast.error('Vor- und Nachname sind Pflicht');
    if (!email.trim() || emailError) return toast.error(emailError || 'Gültige E-Mail erforderlich');
    if (password.length < 8) return toast.error('Passwort muss mindestens 8 Zeichen enthalten');
    if (password !== passwordConfirm) return toast.error('Passwörter stimmen nicht überein');
    if (!abteilung) return toast.error('Abteilung wählen');
    if (!position.trim()) return toast.error('Position wählen oder eingeben');
    if (!startdatum) return toast.error('Startdatum wählen');

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-team-member', {
        body: {
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim().toLowerCase(),
          telefon: telefon.trim() || null,
          password,
          abteilung,
          position: position.trim(),
          rolle,
          startdatum,
          avatar_url: avatarUrl.trim() || null,
          notizen: notizen.trim() || null,
          permission_overrides: overrides,
        },
      });

      if (error) {
        const msg = (data as any)?.error || error.message || 'Unbekannter Fehler';
        toast.error('Anlegen fehlgeschlagen', { description: msg });
        return;
      }
      if ((data as any)?.error) {
        toast.error('Anlegen fehlgeschlagen', { description: (data as any).error });
        return;
      }

      const fullName = `${vorname.trim()} ${nachname.trim()}`;
      toast.success(`Mitarbeiter ${fullName} wurde erfolgreich angelegt`);
      setSuccessData({ name: fullName, email: email.trim().toLowerCase(), password });
      resetForm();
    } catch (e: any) {
      toast.error('Verbindungsfehler', { description: e?.message || 'bitte erneut versuchen' });
    } finally {
      setSubmitting(false);
    }
  };

  const previewName = `${vorname || 'Vorname'} ${nachname || 'Nachname'}`.trim();
  const previewInitials = initials(vorname, nachname);

  const inheritedLabels = allPerms
    .filter(p => roleGrantedKeys.has(p.permission_key) && !(p.permission_key in overrides))
    .map(p => p.label);
  const explicitAllow = allPerms.filter(p => overrides[p.permission_key] === true).map(p => p.label);
  const explicitDeny = allPerms.filter(p => overrides[p.permission_key] === false).map(p => p.label);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Mitarbeiter erstellen</h2>
        <p className="text-sm text-muted-foreground mt-1">Neue Teammitglieder anlegen und einladen</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Form */}
        <Card className="border-border bg-card">
          <CardContent className="p-6 space-y-6">
            {/* Kontaktdaten */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kontaktdaten</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="vorname" className="text-xs">Vorname *</Label>
                  <Input id="vorname" value={vorname} onChange={e => setVorname(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="nachname" className="text-xs">Nachname *</Label>
                  <Input id="nachname" value={nachname} onChange={e => setNachname(e.target.value)} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="email" className="text-xs">E-Mail *</Label>
                  <Input
                    id="email" type="email" value={email}
                    onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                    onBlur={e => validateEmail(e.target.value)}
                    placeholder="name@viralconnect.de"
                    className={`mt-1 ${emailError ? 'border-destructive' : ''}`}
                  />
                  {emailError && <p className="text-[11px] text-destructive mt-1">{emailError}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="telefon" className="text-xs">Telefon</Label>
                  <Input id="telefon" type="tel" value={telefon} onChange={e => setTelefon(e.target.value)} className="mt-1" />
                </div>
              </div>
            </section>

            <div className="border-t border-border" />

            {/* Zugangsdaten */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zugangsdaten</h3>
              <div>
                <Label htmlFor="password" className="text-xs">Passwort *</Label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Input
                      id="password" type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pr-9 font-mono text-sm"
                    />
                    <button
                      type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => { const p = generatePassword(); setPassword(p); setPasswordConfirm(p); setShowPassword(true); }}
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generieren
                  </Button>
                </div>
                <div className="flex gap-1 mt-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-sm ${i < strength.score ? strength.color : 'bg-muted'}`} />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Stärke: {strength.label}</p>
              </div>
              <div>
                <Label htmlFor="password-confirm" className="text-xs">Passwort bestätigen *</Label>
                <Input
                  id="password-confirm" type={showPassword ? 'text' : 'password'}
                  value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                  className={`mt-1 font-mono text-sm ${passwordConfirm && passwordConfirm !== password ? 'border-destructive' : ''}`}
                />
                {passwordConfirm && passwordConfirm !== password && (
                  <p className="text-[11px] text-destructive mt-1">Passwörter stimmen nicht überein</p>
                )}
              </div>
            </section>

            <div className="border-t border-border" />

            {/* Position & Abteilung */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Position & Abteilung</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Abteilung *</Label>
                  <Select value={abteilung} onValueChange={setAbteilung}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      {ABTEILUNGEN.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Position *</Label>
                  <Input
                    value={position} onChange={e => setPosition(e.target.value)}
                    list="position-list" placeholder="Wählen oder eintippen..."
                    className="mt-1"
                  />
                  <datalist id="position-list">
                    {POSITIONEN.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <Label htmlFor="startdatum" className="text-xs">Startdatum *</Label>
                  <Input id="startdatum" type="date" value={startdatum} onChange={e => setStartdatum(e.target.value)} className="mt-1" />
                </div>
              </div>
            </section>

            <div className="border-t border-border" />

            {/* Rolle & Zugriffsrechte */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Rolle & Zugriffsrechte
              </h3>

              <div>
                <Label className="text-xs">Rolle *</Label>
                <Select value={rolle} onValueChange={v => handleRolleChange(v as Rolle)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setter">Mitarbeiter</SelectItem>
                    <SelectItem value="account-manager">Account-Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{ROLE_HINTS[rolle]}</p>
              </div>

              {/* Vorschau geerbter Rechte */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] font-medium text-foreground mb-1.5">
                  Geerbte Rechte aus Rolle „{ROLE_LABELS[rolle]}" ({roleGrantedKeys.size})
                </p>
                {permsLoading ? (
                  <p className="text-[11px] text-muted-foreground">Wird geladen…</p>
                ) : roleGrantedKeys.size === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Keine — nur explizit erlaubte Rechte gelten.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {allPerms
                      .filter(p => roleGrantedKeys.has(p.permission_key))
                      .slice(0, 12)
                      .map(p => (
                        <Badge key={p.permission_key} variant="secondary" className="text-[10px] rounded-[4px]">{p.label}</Badge>
                      ))}
                    {roleGrantedKeys.size > 12 && (
                      <Badge variant="outline" className="text-[10px] rounded-[4px]">+{roleGrantedKeys.size - 12} weitere</Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Toggle: Individuelle Rechte */}
              <button
                type="button"
                onClick={() => setAdvancedOpen(v => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  Individuelle Rechte anpassen
                  {(Object.keys(overrides).length > 0) && (
                    <Badge variant="secondary" className="text-[10px] rounded-[4px]">{Object.keys(overrides).length} Override(s)</Badge>
                  )}
                </span>
                {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {advancedOpen && (
                <div className="space-y-4 pt-1">
                  {permsLoading ? (
                    <p className="text-xs text-muted-foreground">Wird geladen…</p>
                  ) : (
                    Object.entries(grouped).map(([cat, list]) => (
                      <div key={cat}>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{cat}</p>
                        <div className="space-y-1">
                          {list.map(p => {
                            const inRole = roleGrantedKeys.has(p.permission_key);
                            const hasOverride = p.permission_key in overrides;
                            const mode: OverrideMode = !hasOverride ? 'inherit' : overrides[p.permission_key] ? 'allow' : 'deny';
                            const effective = effectiveActive(p.permission_key);
                            return (
                              <div key={p.permission_key} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/60">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-xs font-medium truncate">{p.label}</p>
                                    {inRole && <Badge variant="secondary" className="text-[9px] rounded-[3px]">via Rolle</Badge>}
                                    {effective
                                      ? <Badge className="text-[9px] rounded-[3px] bg-success/20 text-success border-success/30"><Check className="h-2.5 w-2.5 mr-0.5" />aktiv</Badge>
                                      : <Badge variant="outline" className="text-[9px] rounded-[3px] text-muted-foreground"><X className="h-2.5 w-2.5 mr-0.5" />inaktiv</Badge>}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{p.permission_key}</p>
                                </div>
                                <Select value={mode} onValueChange={(v) => setMode(p.permission_key, v as OverrideMode)}>
                                  <SelectTrigger className="w-[130px] h-7 text-[11px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="inherit"><span className="flex items-center gap-1.5 text-[11px]"><Minus className="h-3 w-3" />Rolle erben</span></SelectItem>
                                    <SelectItem value="allow"><span className="flex items-center gap-1.5 text-[11px] text-success"><Check className="h-3 w-3" />Erlauben</span></SelectItem>
                                    <SelectItem value="deny"><span className="flex items-center gap-1.5 text-[11px] text-destructive"><X className="h-3 w-3" />Verweigern</span></SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                  {Object.keys(overrides).length > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setOverrides({})}>
                      Alle Overrides zurücksetzen
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Drive-Datei- und Ordner-Freigaben werden separat im Mitarbeiter-Detail unter „Drive-Freigaben" verwaltet.
                  </p>
                </div>
              )}
            </section>

            <div className="border-t border-border" />

            {/* Zusätzliche Infos */}
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setExtraOpen(v => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span>Zusätzliche Infos (optional)</span>
                {extraOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {extraOpen && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="avatar" className="text-xs">Avatar URL</Label>
                    <Input id="avatar" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..." className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="notizen" className="text-xs">Notizen (intern)</Label>
                    <Textarea id="notizen" value={notizen} onChange={e => setNotizen(e.target.value)} rows={3} className="mt-1" />
                  </div>
                </div>
              )}
            </section>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>Abbrechen</Button>
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird angelegt...</> : <><UserPlus className="h-4 w-4 mr-2" /> Mitarbeiter anlegen</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Live Preview */}
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Vorschau</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm overflow-hidden"
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : previewInitials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{previewName}</p>
                  <p className="text-xs text-muted-foreground truncate">{email || 'email@domain.de'}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Position:</span>
                  <span className="text-foreground text-right">{position || '–'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Abteilung:</span>
                  <span className="text-foreground text-right">{abteilung || '–'}</span>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <span className="text-muted-foreground">Rolle:</span>
                  <Badge variant="secondary" className="rounded-[4px] text-xs">{ROLE_LABELS[rolle]}</Badge>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Start:</span>
                  <span className="text-foreground text-right">
                    {startdatum ? new Date(startdatum).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '–'}
                  </span>
                </div>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Effektive Rechte:</p>
                  {permsLoading ? (
                    <p className="text-xs text-muted-foreground">…</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {inheritedLabels.length + explicitAllow.length} aktiv
                      {explicitAllow.length > 0 && <> · {explicitAllow.length} individuell erlaubt</>}
                      {explicitDeny.length > 0 && <> · {explicitDeny.length} individuell verweigert</>}
                    </p>
                  )}
                </div>
                {explicitAllow.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {explicitAllow.map(l => (
                      <Badge key={l} className="text-[10px] rounded-[4px] bg-success/15 text-success border-success/30">+ {l}</Badge>
                    ))}
                  </div>
                )}
                {explicitDeny.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {explicitDeny.map(l => (
                      <Badge key={l} variant="outline" className="text-[10px] rounded-[4px] text-destructive border-destructive/30">– {l}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/80 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Info className="h-3.5 w-3.5 text-primary" /> Nach dem Anlegen:
            </div>
            <ul className="space-y-1 ml-5 list-disc text-muted-foreground">
              <li>Mitarbeiter erhält Zugangsdaten (per Slack/Mail manuell weiterleiten)</li>
              <li>Kann sich sofort unter haushhaush.lovable.app anmelden</li>
              <li>Rolle und individuelle Rechte können im Mitarbeiter-Detail unter „Rollen &amp; Rechte" jederzeit angepasst werden</li>
              <li>Drive-Freigaben werden separat im Tab „Drive-Freigaben" gepflegt</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog open={!!successData} onOpenChange={(o) => !o && setSuccessData(null)}>
        <DialogContent persistent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" /> Mitarbeiter erfolgreich angelegt
            </DialogTitle>
          </DialogHeader>
          {successData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{successData.name}</span> kann sich jetzt anmelden:
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 font-mono text-xs">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">E-Mail:</span><span className="text-foreground break-all text-right">{successData.email}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Passwort:</span><span className="text-foreground break-all text-right">{successData.password}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Login:</span><span className="text-foreground break-all text-right">haushhaush.lovable.app</span></div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline" size="sm" className="flex-1"
                  onClick={() => {
                    const txt = `E-Mail: ${successData.email}\nPasswort: ${successData.password}\nLogin: https://haushhaush.lovable.app`;
                    navigator.clipboard.writeText(txt);
                    toast.success('Zugangsdaten kopiert');
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Zugangsdaten kopieren
                </Button>
                <Button
                  variant="outline" size="sm" className="flex-1" asChild
                >
                  <a
                    href={`mailto:${successData.email}?subject=${encodeURIComponent('Willkommen im Haush Haush Agency Hub')}&body=${encodeURIComponent(
                      `Hallo ${successData.name},\n\nDeine Zugangsdaten zum Agency Hub:\n\nE-Mail: ${successData.email}\nPasswort: ${successData.password}\nLogin: https://haushhaush.lovable.app\n\nBitte ändere dein Passwort nach dem ersten Login.`
                    )}`}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" /> Als E-Mail
                  </a>
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSuccessData(null)}>Fertig</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
