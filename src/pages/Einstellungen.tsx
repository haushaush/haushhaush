import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { HardDrive, Zap, Globe, Bell, Palette, Users, CheckCircle, XCircle, Hash, RefreshCw, X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface EmployeeRequest {
  id: string;
  user_id: string | null;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string | null;
  geburtsdatum: string | null;
  position: string | null;
  abteilung: string | null;
  vertragsart: string | null;
  startdatum: string | null;
  ueber_mich: string | null;
  notfall_name: string | null;
  notfall_telefon: string | null;
  adresse: string | null;
  iban: string | null;
  profilbild_url: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notiz: string | null;
  created_at: string;
}

export default function Einstellungen() {
  const { user, isAdminOrManager } = useAuth();
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<EmployeeRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const fetchData = async () => {
    const [driveRes, teamRes, reqRes] = await Promise.all([
      user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('team').select('*').order('name'),
      isAdminOrManager ? supabase.from('employee_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    if (driveRes.data) { setDriveConnected(true); setDriveEmail(driveRes.data.google_email); }
    setTeam(teamRes.data || []);
    setRequests((reqRes.data || []) as EmployeeRequest[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, isAdminOrManager]);

  const pendingCount = requests.filter(r => r.status === 'Ausstehend').length;

  const openDrawer = (req: EmployeeRequest) => {
    setSelectedReq(req);
    setAdminNote(req.admin_notiz || '');
    setDrawerOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedReq) return;
    // Update request
    await supabase.from('employee_requests').update({
      status: 'Genehmigt',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      admin_notiz: adminNote || null,
    }).eq('id', selectedReq.id);

    // Add to team table
    await supabase.from('team').insert({
      name: `${selectedReq.vorname} ${selectedReq.nachname}`,
      email: selectedReq.email,
      rolle: 'Setter' as any, // default role
      department: selectedReq.abteilung || 'Sales',
      startdatum: selectedReq.startdatum || new Date().toISOString().split('T')[0],
    });

    toast.success('Mitarbeiter wurde freigeschaltet');
    setDrawerOpen(false);
    fetchData();
  };

  const handleReject = async () => {
    if (!selectedReq) return;
    await supabase.from('employee_requests').update({
      status: 'Abgelehnt',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      admin_notiz: rejectReason || adminNote || null,
    }).eq('id', selectedReq.id);

    toast.success('Anfrage wurde abgelehnt');
    setRejectOpen(false);
    setDrawerOpen(false);
    setRejectReason('');
    fetchData();
  };

  const maskIban = (iban: string | null) => {
    if (!iban || iban.length < 6) return iban || '–';
    return iban.slice(0, 4) + ' •••• ••••';
  };

  const statusBadge = (status: string) => {
    if (status === 'Ausstehend') return <Badge className="bg-warning/20 text-warning border-0 text-xs">Ausstehend</Badge>;
    if (status === 'Genehmigt') return <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0 text-xs">Genehmigt</Badge>;
    if (status === 'Abgelehnt') return <Badge className="bg-destructive/20 text-destructive border-0 text-xs">Abgelehnt</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <Tabs defaultValue="integrationen">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="integrationen">Integrationen</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="benutzer" className="relative">
            Benutzer
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="benachrichtigungen">Benachrichtigungen</TabsTrigger>
        </TabsList>

        <TabsContent value="integrationen" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <RefreshCw className="h-6 w-6 text-blue-500" />
                <div className="flex-1"><CardTitle className="text-base">Close CRM</CardTitle><p className="text-xs text-muted-foreground mt-1">Deals via n8n</p></div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Webhook URL</Label><Input placeholder="https://n8n..." className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast.success('Sync angestoßen')}>Manuell synchronisieren</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-orange-500" />
                <div className="flex-1"><CardTitle className="text-base">n8n</CardTitle><p className="text-xs text-muted-foreground mt-1">Automatisierungen</p></div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Outgoing Webhook URL</Label><Input placeholder="https://n8n..." className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast.success('Gespeichert')}>Speichern</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <HardDrive className="h-6 w-6 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {driveConnected ? <Badge className="bg-emerald-500/20 text-emerald-600 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Verbunden</Badge> : <Badge variant="secondary" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Nicht verbunden</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {driveEmail && <p className="text-sm text-muted-foreground">{driveEmail}</p>}
                <div><Label>Root-Ordner ID</Label><Input placeholder="1abc..." className="mt-1" /></div>
                <Button variant="outline" className="w-full">{driveConnected ? 'Ordnerstruktur aufbauen' : 'Verbinden'}</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-blue-500" />
                <div><CardTitle className="text-base">Meta Ads</CardTitle><p className="text-xs text-muted-foreground mt-1">Pro Kunde konfigurierbar</p></div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Ad Accounts werden pro Kunde verbunden.</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Globe className="h-6 w-6 text-emerald-500" />
                <div className="flex-1"><CardTitle className="text-base">OnePage.io</CardTitle><p className="text-xs text-muted-foreground mt-1">Landing Pages & Formulare</p></div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>API Key</Label><Input type="password" placeholder="op_key_..." className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast.success('Gespeichert')}>Speichern</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Hash className="h-6 w-6 text-purple-500" />
                <div className="flex-1">
                  <CardTitle className="text-base">Slack</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">haushhaush.slack.com</p>
                  <Badge className="bg-emerald-500/20 text-emerald-600 text-xs mt-1"><CheckCircle className="h-3 w-3 mr-1" />Verbunden</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Abschlüsse Channel</Label><Input defaultValue="C0AAN7SARLH" className="mt-1" /></div>
                <div><Label>Laufzeiten Channel</Label><Input defaultValue="C0AEKP0HNV8" className="mt-1" /></div>
                <div><Label>Buchhaltung Channel</Label><Input defaultValue="C0AA3R29KSP" className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast.success('Gespeichert')}>Speichern</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="branding" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Logo & Branding</CardTitle></CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                <p className="text-sm">Logo hierher ziehen oder klicken</p>
                <p className="text-xs mt-1">PNG, SVG bis 2MB</p>
              </div>
            </CardContent>
          </Card>
          {[
            { name: 'Viral Connect GmbH', gf: 'Noah Mrosek', fmt: 'VC-2026-001' },
            { name: 'Haush Haush Digital UG', gf: 'Maximilian Büsse', fmt: 'HH-2026-001' },
          ].map(e => (
            <Card key={e.name}>
              <CardHeader><CardTitle className="text-base">{e.name}</CardTitle><p className="text-xs text-muted-foreground">GF: {e.gf}</p></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Adresse</Label><Input placeholder="Musterstr. 1, 12345 Berlin" /></div>
                  <div><Label>USt-ID</Label><Input placeholder="DE123456789" /></div>
                  <div><Label>Steuernummer</Label><Input placeholder="12/345/67890" /></div>
                  <div><Label>IBAN</Label><Input placeholder="DE89 3704 0044 ..." /></div>
                  <div><Label>BIC</Label><Input placeholder="COBADEFFXXX" /></div>
                  <div><Label>Rechnungsnr.-Format</Label><Input value={e.fmt} readOnly className="bg-muted" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="benutzer" className="mt-4 space-y-6">
          {isAdminOrManager && requests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Mitarbeiter-Anfragen</h3>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Abteilung</TableHead>
                    <TableHead>Eingereicht</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {requests.map(r => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDrawer(r)}>
                        <TableCell className="font-medium">{r.vorname} {r.nachname}</TableCell>
                        <TableCell className="text-muted-foreground">{r.email}</TableCell>
                        <TableCell>{r.position || '–'}</TableCell>
                        <TableCell>{r.abteilung || '–'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString('de-DE')}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent></Card>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Aktive Mitarbeiter</h3>
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>E-Mail</TableHead><TableHead>Rolle</TableHead><TableHead>Abteilung</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {team.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{m.rolle}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{m.department || '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent></Card>
          </div>
          <Button variant="outline"><Users className="h-4 w-4 mr-2" />Per E-Mail einladen</Button>
        </TabsContent>

        <TabsContent value="benachrichtigungen" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Benachrichtigungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Neuer Abschluss', desc: 'Admin + Customer Success', channels: ['In-App', 'Email'] },
                { label: 'Rechnung überfällig', desc: 'Nach 14 Tagen → Admin', channels: ['Email'] },
                { label: 'Laufzeit endet <14 Tage', desc: 'Zugewiesenes Teammitglied', channels: ['In-App', 'Email'] },
                { label: 'Setter KPI Alert', desc: 'Management', channels: ['Email'] },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">{n.label}</p><p className="text-xs text-muted-foreground">{n.desc}</p></div>
                  <div className="flex gap-3">
                    {n.channels.map(c => (
                      <div key={c} className="flex items-center gap-1.5"><Switch /><span className="text-xs text-muted-foreground">{c}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
          {selectedReq && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-4">
                  {selectedReq.profilbild_url ? (
                    <img src={selectedReq.profilbild_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                      {selectedReq.vorname[0]}{selectedReq.nachname[0]}
                    </div>
                  )}
                  <div>
                    <SheetTitle className="text-lg">{selectedReq.vorname} {selectedReq.nachname}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{selectedReq.position} · {selectedReq.abteilung}</p>
                    <div className="mt-1">{statusBadge(selectedReq.status)}</div>
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs">E-Mail</p><p className="font-medium">{selectedReq.email}</p></div>
                <div><p className="text-muted-foreground text-xs">Telefon</p><p className="font-medium">{selectedReq.telefon || '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Geburtsdatum</p><p className="font-medium">{selectedReq.geburtsdatum ? new Date(selectedReq.geburtsdatum).toLocaleDateString('de-DE') : '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Startdatum</p><p className="font-medium">{selectedReq.startdatum ? new Date(selectedReq.startdatum).toLocaleDateString('de-DE') : '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Vertragsart</p><p className="font-medium">{selectedReq.vertragsart || '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">Adresse</p><p className="font-medium">{selectedReq.adresse || '–'}</p></div>
                <div><p className="text-muted-foreground text-xs">IBAN</p><p className="font-medium">{maskIban(selectedReq.iban)}</p></div>
                <div><p className="text-muted-foreground text-xs">Notfall-Kontakt</p><p className="font-medium">{selectedReq.notfall_name ? `${selectedReq.notfall_name} (${selectedReq.notfall_telefon || '–'})` : '–'}</p></div>
              </div>

              {selectedReq.ueber_mich && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Über mich</p>
                  <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3">{selectedReq.ueber_mich}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Interne Anmerkung (nur für Admins)</Label>
                <Textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="z.B. Wurde im Interview überzeugt, Start Q2..."
                  className="mt-1 min-h-[60px]"
                  onBlur={async () => {
                    if (selectedReq.admin_notiz !== adminNote) {
                      await supabase.from('employee_requests').update({ admin_notiz: adminNote }).eq('id', selectedReq.id);
                    }
                  }}
                  disabled={selectedReq.status !== 'Ausstehend'}
                />
              </div>

              {selectedReq.status === 'Ausstehend' ? (
                <div className="space-y-2">
                  <Button className="w-full h-12 rounded-[10px] bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove}>
                    <Check className="h-4 w-4 mr-2" /> Genehmigen
                  </Button>
                  <Button variant="outline" className="w-full h-12 rounded-[10px] text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setRejectOpen(true)}>
                    <X className="h-4 w-4 mr-2" /> Ablehnen
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  {selectedReq.status === 'Genehmigt' ? '✓ Genehmigt' : '✗ Abgelehnt'}
                  {selectedReq.reviewed_at && ` am ${new Date(selectedReq.reviewed_at).toLocaleDateString('de-DE')}`}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Anfrage ablehnen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Grund für Ablehnung</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Begründung eingeben..." className="min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleReject}>Ablehnen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
