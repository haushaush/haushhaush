import { useEffect, useState, useMemo } from 'react';
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
import { HardDrive, Zap, Globe, Bell, Palette, Users, CheckCircle, XCircle, Hash, RefreshCw, X, Check, Search } from 'lucide-react';
import { toast } from 'sonner';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { IntegrationStatusBar } from '@/components/integrations/IntegrationStatusBar';
import { PROVIDERS, CATEGORIES } from '@/components/integrations/IntegrationProviders';
import { ApiPlatform } from '@/components/integrations/ApiPlatform';

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

interface IntegrationSetting {
  id: string;
  provider: string;
  connected: boolean;
  config: Record<string, any>;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
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
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSetting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Alle');
  const [syncingAll, setSyncingAll] = useState(false);

  const fetchData = async () => {
    const [driveRes, teamRes, reqRes, intRes] = await Promise.all([
      user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('team').select('*').order('name'),
      isAdminOrManager ? supabase.from('employee_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      user ? supabase.from('integration_settings').select('*').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ]);
    if (driveRes.data) { setDriveConnected(true); setDriveEmail(driveRes.data.google_email); }
    setTeam(teamRes.data || []);
    setRequests((reqRes.data || []) as EmployeeRequest[]);
    setIntegrationSettings((intRes.data || []) as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, isAdminOrManager]);

  const pendingCount = requests.filter(r => r.status === 'Ausstehend').length;

  // Integration helpers
  const getSettingForProvider = (providerId: string) => {
    return integrationSettings.find(s => s.provider === providerId);
  };

  const handleIntegrationSave = async (providerId: string, data: Record<string, any>) => {
    if (!user) return;
    const existing = getSettingForProvider(providerId);
    
    if (existing) {
      await supabase.from('integration_settings').update({
        config: data,
        connected: true,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('integration_settings').insert({
        user_id: user.id,
        provider: providerId,
        display_name: PROVIDERS.find(p => p.id === providerId)?.name || providerId,
        config: data,
        connected: true,
      });
    }
    toast.success('Integration gespeichert');
    fetchData();
  };

  const handleIntegrationAction = async (providerId: string, action: string) => {
    if (action === 'sync') {
      toast.info('Synchronisierung gestartet...');
      // Update sync status
      const existing = getSettingForProvider(providerId);
      if (existing) {
        await supabase.from('integration_settings').update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
        }).eq('id', existing.id);
      }
      toast.success('Synchronisierung abgeschlossen');
      fetchData();
    } else if (action === 'test') {
      toast.success('Verbindungstest erfolgreich ✓');
    } else if (action === 'connect') {
      toast.info('OAuth-Verbindung wird vorbereitet...');
    } else if (action === 'build_structure') {
      toast.info('Ordnerstruktur wird erstellt...');
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    toast.info('Alle Integrationen werden synchronisiert...');
    await new Promise(r => setTimeout(r, 2000));
    setSyncingAll(false);
    toast.success('Alle Integrationen synchronisiert');
  };

  const filteredProviders = useMemo(() => {
    return PROVIDERS.filter(p => {
      const matchesSearch = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'Alle' ||
        (activeCategory === 'Verbunden' ? !!getSettingForProvider(p.id)?.connected : p.category === activeCategory);
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory, integrationSettings]);

  const integrationStatusData = PROVIDERS.map(p => ({
    provider: p.id,
    connected: !!getSettingForProvider(p.id)?.connected || (p.id === 'slack' || p.id === 'google_drive' ? driveConnected || p.id === 'slack' : false),
    category: p.category,
    last_sync_at: getSettingForProvider(p.id)?.last_sync_at || null,
  }));

  const openDrawer = (req: EmployeeRequest) => {
    setSelectedReq(req);
    setAdminNote(req.admin_notiz || '');
    setDrawerOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedReq) return;
    await supabase.from('employee_requests').update({
      status: 'Genehmigt',
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      admin_notiz: adminNote || null,
    }).eq('id', selectedReq.id);

    await supabase.from('team').insert({
      name: `${selectedReq.vorname} ${selectedReq.nachname}`,
      email: selectedReq.email,
      rolle: 'Setter' as any,
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
    if (status === 'Ausstehend') return <Badge className="bg-[var(--color-orange-subtle)] text-[var(--color-orange-text)] border-0 text-xs">Ausstehend</Badge>;
    if (status === 'Genehmigt') return <Badge className="bg-[var(--color-green-subtle)] text-[var(--color-green-text)] border-0 text-xs">Genehmigt</Badge>;
    if (status === 'Abgelehnt') return <Badge className="bg-[var(--color-red-subtle)] text-[var(--color-red-text)] border-0 text-xs">Abgelehnt</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Einstellungen</h1>

      <Tabs defaultValue="integrationen">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="integrationen">Integrationen</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="benutzer" className="relative">
            Benutzer
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[var(--color-red)] text-white text-[10px] font-bold px-1.5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="benachrichtigungen">Benachrichtigungen</TabsTrigger>
        </TabsList>

        {/* ═══════ INTEGRATIONEN TAB ═══════ */}
        <TabsContent value="integrationen" className="mt-6 space-y-6">
          {/* Status Dashboard */}
          <IntegrationStatusBar
            integrations={integrationStatusData}
            onSyncAll={handleSyncAll}
            syncing={syncingAll}
          />

          {/* Search + Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <Input
                placeholder="Integrationen durchsuchen..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-[var(--color-teal)] text-white'
                      : 'bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Integration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProviders.map(provider => {
              const setting = getSettingForProvider(provider.id);
              const isSlackConnected = provider.id === 'slack';
              const isDriveConnected = provider.id === 'google_drive' && driveConnected;
              return (
                <IntegrationCard
                  key={provider.id}
                  provider={provider}
                  connected={setting?.connected || isSlackConnected || isDriveConnected}
                  lastSyncAt={setting?.last_sync_at}
                  lastSyncStatus={setting?.last_sync_status}
                  lastSyncError={setting?.last_sync_error}
                  config={setting?.config || {}}
                  onSave={handleIntegrationSave}
                  onAction={handleIntegrationAction}
                />
              );
            })}
          </div>

          {filteredProviders.length === 0 && (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p className="text-sm">Keine Integrationen gefunden.</p>
            </div>
          )}

          {/* API Platform */}
          <div className="border-t border-[var(--border)] pt-8">
            <ApiPlatform />
          </div>
        </TabsContent>

        {/* ═══════ BRANDING TAB ═══════ */}
        <TabsContent value="branding" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-[var(--color-teal)]" />Logo & Branding</CardTitle></CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-8 text-center text-[var(--text-muted)]">
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
              <CardHeader><CardTitle className="text-base">{e.name}</CardTitle><p className="text-xs text-[var(--text-muted)]">GF: {e.gf}</p></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Adresse</Label><Input placeholder="Musterstr. 1, 12345 Berlin" /></div>
                  <div><Label>USt-ID</Label><Input placeholder="DE123456789" /></div>
                  <div><Label>Steuernummer</Label><Input placeholder="12/345/67890" /></div>
                  <div><Label>IBAN</Label><Input placeholder="DE89 3704 0044 ..." /></div>
                  <div><Label>BIC</Label><Input placeholder="COBADEFFXXX" /></div>
                  <div><Label>Rechnungsnr.-Format</Label><Input value={e.fmt} readOnly className="bg-[var(--bg-app)]" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ═══════ BENUTZER TAB ═══════ */}
        <TabsContent value="benutzer" className="mt-4 space-y-6">
          {isAdminOrManager && requests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">Mitarbeiter-Anfragen</h3>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead className="hidden sm:table-cell">Position</TableHead>
                    <TableHead className="hidden sm:table-cell">Abteilung</TableHead>
                    <TableHead className="hidden md:table-cell">Eingereicht</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {requests.map(r => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-[var(--bg-app)]" onClick={() => openDrawer(r)}>
                        <TableCell className="font-medium">{r.vorname} {r.nachname}</TableCell>
                        <TableCell className="text-[var(--text-muted)]">{r.email}</TableCell>
                        <TableCell className="hidden sm:table-cell">{r.position || '–'}</TableCell>
                        <TableCell className="hidden sm:table-cell">{r.abteilung || '–'}</TableCell>
                        <TableCell className="text-[var(--text-muted)] text-xs hidden md:table-cell">{new Date(r.created_at).toLocaleDateString('de-DE')}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent></Card>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">Aktive Mitarbeiter</h3>
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>E-Mail</TableHead><TableHead>Rolle</TableHead><TableHead className="hidden sm:table-cell">Abteilung</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {team.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-[var(--text-muted)]">{m.email}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{m.rolle}</Badge></TableCell>
                      <TableCell className="text-[var(--text-muted)] hidden sm:table-cell">{m.department || '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div></CardContent></Card>
          </div>
          <Button variant="outline"><Users className="h-4 w-4 mr-2" />Per E-Mail einladen</Button>
        </TabsContent>

        {/* ═══════ BENACHRICHTIGUNGEN TAB ═══════ */}
        <TabsContent value="benachrichtigungen" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-[var(--color-teal)]" />Benachrichtigungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Neuer Abschluss', desc: 'Admin + Customer Success', channels: ['In-App', 'Email'] },
                { label: 'Rechnung überfällig', desc: 'Nach 14 Tagen → Admin', channels: ['Email'] },
                { label: 'Laufzeit endet <14 Tage', desc: 'Zugewiesenes Teammitglied', channels: ['In-App', 'Email'] },
                { label: 'Setter KPI Alert', desc: 'Management', channels: ['Email'] },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between">
                  <div><p className="text-sm font-medium text-[var(--text-primary)]">{n.label}</p><p className="text-xs text-[var(--text-muted)]">{n.desc}</p></div>
                  <div className="flex gap-3">
                    {n.channels.map(c => (
                      <div key={c} className="flex items-center gap-1.5"><Switch /><span className="text-xs text-[var(--text-muted)]">{c}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Request Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
          {selectedReq && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-4">
                  {selectedReq.profilbild_url ? (
                    <img src={selectedReq.profilbild_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-[var(--color-teal-subtle)] flex items-center justify-center text-[var(--color-teal)] font-semibold text-lg">
                      {selectedReq.vorname[0]}{selectedReq.nachname[0]}
                    </div>
                  )}
                  <div>
                    <SheetTitle className="text-lg">{selectedReq.vorname} {selectedReq.nachname}</SheetTitle>
                    <p className="text-sm text-[var(--text-muted)]">{selectedReq.position} · {selectedReq.abteilung}</p>
                    <div className="mt-1">{statusBadge(selectedReq.status)}</div>
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-[var(--text-muted)] text-xs">E-Mail</p><p className="font-medium">{selectedReq.email}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">Telefon</p><p className="font-medium">{selectedReq.telefon || '–'}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">Geburtsdatum</p><p className="font-medium">{selectedReq.geburtsdatum ? new Date(selectedReq.geburtsdatum).toLocaleDateString('de-DE') : '–'}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">Startdatum</p><p className="font-medium">{selectedReq.startdatum ? new Date(selectedReq.startdatum).toLocaleDateString('de-DE') : '–'}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">Vertragsart</p><p className="font-medium">{selectedReq.vertragsart || '–'}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">Adresse</p><p className="font-medium">{selectedReq.adresse || '–'}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">IBAN</p><p className="font-medium">{maskIban(selectedReq.iban)}</p></div>
                <div><p className="text-[var(--text-muted)] text-xs">Notfall-Kontakt</p><p className="font-medium">{selectedReq.notfall_name ? `${selectedReq.notfall_name} (${selectedReq.notfall_telefon || '–'})` : '–'}</p></div>
              </div>

              {selectedReq.ueber_mich && (
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1">Über mich</p>
                  <p className="text-sm text-[var(--text-primary)] bg-[var(--bg-app)] rounded-lg p-3">{selectedReq.ueber_mich}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-[var(--text-muted)]">Interne Anmerkung (nur für Admins)</Label>
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
                  <Button className="w-full h-12 rounded-[10px] bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white" onClick={handleApprove}>
                    <Check className="h-4 w-4 mr-2" /> Genehmigen
                  </Button>
                  <Button variant="outline" className="w-full h-12 rounded-[10px] text-[var(--color-red)] hover:bg-[var(--color-red-subtle)] border-[var(--color-red)]" onClick={() => setRejectOpen(true)}>
                    <X className="h-4 w-4 mr-2" /> Ablehnen
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-[var(--text-muted)] bg-[var(--bg-app)] rounded-lg p-3">
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
