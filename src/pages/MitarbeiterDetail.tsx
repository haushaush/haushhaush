import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { ChevronLeft, Save, Mail, Phone, Calendar, Euro, FileText, Shield, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { RollenUndRechteTab } from '@/components/team/RollenUndRechteTab';
import { DriveFreigabenTab } from '@/components/team/DriveFreigabenTab';
import { ZugriffStatusCard } from '@/components/team/ZugriffStatusCard';

const PORTAL_ROLLEN = [
  { value: 'admin', label: 'Admin', desc: 'Vollzugriff auf alles inkl. Finanzen' },
  { value: 'management', label: 'Management', desc: 'Alles außer Kontostand & Bankdaten' },
  { value: 'mitarbeiter', label: 'Mitarbeiter', desc: 'Nur eigene Daten & Aufgaben' },
];

const ABTEILUNGEN = ['Sales', 'Setter', 'Closer', 'Design', 'Tech', 'Development', 'Websites', 'Media Buying', 'Operation', 'Support', 'Backoffice', 'Foto & Video', 'Copywriting', 'Sonstiges'];

export default function MitarbeiterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data } = await supabase.from('team').select('*').eq('id', id).single();
      if (data) {
        setMember(data);
        setForm(data);
        if (isAdmin && data.email) {
          const { data: mapping } = await (supabase.rpc as any)('team_with_auth_ids');
          const row = (mapping || []).find((r: any) => (r.email || '').toLowerCase() === (data.email || '').toLowerCase());
          setAuthUserId(row?.auth_user_id ?? null);
        }
      }
      setLoading(false);
    };
    load();
  }, [id, isAdmin]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    const { error } = await supabase.from('team').update({
      name: form.name,
      email: form.email,
      rolle: form.rolle,
      position: form.position,
      portal_rolle: form.portal_rolle,
      abteilung: form.abteilung,
      mitarbeiter_typ: form.mitarbeiter_typ,
      mitarbeiter_status: form.mitarbeiter_status,
      telefonnummer: form.telefonnummer,
      startdatum: form.startdatum,
      probezeit_ende: form.probezeit_ende,
      gehalt: form.gehalt ? Number(form.gehalt) : null,
      gehalt_typ: form.gehalt_typ,
      vertrag_typ: form.vertrag_typ,
      vertrag_beginn: form.vertrag_beginn,
      vertrag_ende: form.vertrag_ende,
      wochenstunden: form.wochenstunden ? Number(form.wochenstunden) : null,
      verfuegbarkeit_h_woche: form.verfuegbarkeit_h_woche ? Number(form.verfuegbarkeit_h_woche) : null,
      nda_unterschrieben: form.nda_unterschrieben,
      onboarding_abgeschlossen: form.onboarding_abgeschlossen,
      notizen: form.notizen,
    }).eq('id', id!);

    if (error) toast.error('Fehler beim Speichern: ' + error.message);
    else { toast.success('Gespeichert'); setMember({ ...member, ...form }); }
    setSaving(false);
  };

  const initials = (name: string) => name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

  const portalRolleColor = (r: string) => ({
    admin: 'bg-primary/20 text-primary border-primary/30',
    management: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    mitarbeiter: 'bg-muted text-muted-foreground border-border',
  }[r] || 'bg-muted text-muted-foreground');

  const statusColor = (s: string) => ({
    Aktiv: 'bg-success/20 text-success',
    Probezeit: 'bg-warning/20 text-warning',
    Gekündigt: 'bg-destructive/20 text-destructive',
  }[s] || 'bg-muted text-muted-foreground');

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/hr/mitarbeiter')} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Zurück
        </Button>
        <p className="text-muted-foreground">Mitarbeiter nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/hr/mitarbeiter')} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Zurück
        </Button>
      </div>

      {/* Profile Hero */}
      <Card className="rounded-[14px]">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <Avatar className="h-20 w-20 text-xl">
              {form.avatar_url && <AvatarImage src={form.avatar_url} />}
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {initials(form.name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-heading font-bold">{member.name}</h1>
                <Badge variant="outline" className={portalRolleColor(member.portal_rolle)}>
                  {PORTAL_ROLLEN.find(r => r.value === member.portal_rolle)?.label || member.portal_rolle}
                </Badge>
                <Badge variant="secondary" className={statusColor(member.mitarbeiter_status)}>
                  {member.mitarbeiter_status || 'Aktiv'}
                </Badge>
              </div>

              <p className="text-muted-foreground mt-1">{member.position}</p>

              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                {member.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{member.email}</span>
                )}
                {member.telefonnummer && (
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{member.telefonnummer}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {member.einstiegsdatum ? (() => {
                    const start = new Date(member.einstiegsdatum);
                    const now = new Date();
                    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                    if (months < 1) return 'Neu';
                    if (months >= 12) {
                      const years = Math.floor(months / 12);
                      const rem = months % 12;
                      return rem > 0 ? `${years} Jahre ${rem} Monate` : `${years} Jahre`;
                    }
                    return `${months} Monate`;
                  })() : '—'}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {(member.abteilung || []).map((a: string) => (
                  <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                ))}
              </div>
            </div>

            {isAdmin && (
              <Button onClick={handleSave} disabled={saving} className="gap-2 min-h-[44px]">
                <Save className="h-4 w-4" />
                {saving ? 'Speichert...' : 'Speichern'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profil" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profil">👤 Profil</TabsTrigger>
          <TabsTrigger value="vertrag">📄 Vertrag & Gehalt</TabsTrigger>
        </TabsList>

        {/* PROFIL TAB */}
        <TabsContent value="profil" className="space-y-4 mt-4">
          <Card className="rounded-[14px]">
            <CardHeader className="p-5 pb-3"><CardTitle className="text-sm">Stammdaten</CardTitle></CardHeader>
            <CardContent className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Position / Tätigkeit</Label>
                <Input value={form.position || ''} onChange={e => setForm({...form, position: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">E-Mail</Label>
                <Input value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Telefon</Label>
                <Input value={form.telefonnummer || ''} onChange={e => setForm({...form, telefonnummer: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Abteilung</Label>
                <Select value={(form.abteilung || [])[0] || ''} onValueChange={v => setForm({...form, abteilung: [v]})} disabled={!isAdmin}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen" /></SelectTrigger>
                  <SelectContent>{ABTEILUNGEN.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Startdatum</Label>
                <Input type="date" value={form.startdatum || ''} onChange={e => setForm({...form, startdatum: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.mitarbeiter_status || 'Aktiv'} onValueChange={v => setForm({...form, mitarbeiter_status: v})} disabled={!isAdmin}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Aktiv', 'Probezeit', 'Freelancer', 'Onboarding', 'Gekündigt'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Typ</Label>
                <Select value={form.mitarbeiter_typ || ''} onValueChange={v => setForm({...form, mitarbeiter_typ: v})} disabled={!isAdmin}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Wählen" /></SelectTrigger>
                  <SelectContent>
                    {['Fulfillment', 'Management', 'Sales'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="rounded-[14px]">
              <CardHeader className="p-5 pb-3"><CardTitle className="text-sm">Portal-Rolle & Berechtigungen</CardTitle></CardHeader>
              <CardContent className="p-5 pt-0 space-y-2">
                {PORTAL_ROLLEN.map(r => (
                  <div
                    key={r.value}
                    onClick={() => setForm({...form, portal_rolle: r.value})}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${form.portal_rolle === r.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                  >
                    <div>
                      <p className="font-medium text-sm">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{r.desc}</p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 ${form.portal_rolle === r.value ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[14px]">
            <CardHeader className="p-5 pb-3"><CardTitle className="text-sm">Checkboxen</CardTitle></CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {[
                { key: 'nda_unterschrieben', label: 'NDA unterschrieben' },
                { key: 'onboarding_abgeschlossen', label: 'Onboarding abgeschlossen' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-sm">{label}</Label>
                  <Switch checked={!!form[key]} onCheckedChange={v => setForm({...form, [key]: v})} disabled={!isAdmin} />
                </div>
              ))}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="rounded-[14px]">
              <CardHeader className="p-5 pb-3"><CardTitle className="text-sm">Notizen (Admin)</CardTitle></CardHeader>
              <CardContent className="p-5 pt-0">
                <Textarea value={form.notizen || ''} onChange={e => setForm({...form, notizen: e.target.value})} placeholder="Interne Notizen zum Mitarbeiter..." rows={4} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* VERTRAG & GEHALT TAB */}
        <TabsContent value="vertrag" className="space-y-4 mt-4">
          <Card className="rounded-[14px]">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Euro className="h-4 w-4 text-primary" />Gehalt & Vergütung</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Gehalt (€)</Label>
                <Input type="number" value={form.gehalt || ''} onChange={e => setForm({...form, gehalt: e.target.value})} disabled={!isAdmin} className="mt-1" placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vergütungstyp</Label>
                <Select value={form.gehalt_typ || 'monatlich'} onValueChange={v => setForm({...form, gehalt_typ: v})} disabled={!isAdmin}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['monatlich', 'stündlich', 'projektbasiert', 'provision'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Wochenstunden</Label>
                <Input type="number" value={form.wochenstunden || ''} onChange={e => setForm({...form, wochenstunden: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Verfügbarkeit (h/Woche)</Label>
                <Input type="number" value={form.verfuegbarkeit_h_woche || ''} onChange={e => setForm({...form, verfuegbarkeit_h_woche: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[14px]">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Vertrag</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Vertragstyp</Label>
                <Select value={form.vertrag_typ || ''} onValueChange={v => setForm({...form, vertrag_typ: v})} disabled={!isAdmin}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Typ wählen" /></SelectTrigger>
                  <SelectContent>
                    {['Vollzeit', 'Teilzeit', 'Werkstudent', 'Minijob', 'Freelancer', 'Praktikum'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vertragsbeginn</Label>
                <Input type="date" value={form.vertrag_beginn || ''} onChange={e => setForm({...form, vertrag_beginn: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vertragsende (leer = unbefristet)</Label>
                <Input type="date" value={form.vertrag_ende || ''} onChange={e => setForm({...form, vertrag_ende: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Probezeit bis</Label>
                <Input type="date" value={form.probezeit_ende || ''} onChange={e => setForm({...form, probezeit_ende: e.target.value})} disabled={!isAdmin} className="mt-1" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
