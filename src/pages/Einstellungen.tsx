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
import { Separator } from '@/components/ui/separator';
import { HardDrive, Zap, Globe, Bell, Palette, Users, CheckCircle, XCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Einstellungen() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [driveRes, teamRes] = await Promise.all([
        user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('team').select('*').order('name'),
      ]);
      if (driveRes.data) { setDriveConnected(true); setDriveEmail(driveRes.data.google_email); }
      setTeam(teamRes.data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="space-y-6" role="status" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Einstellungen</h1>
        <p className="text-muted-foreground text-sm">Integrationen, Branding und Benutzer</p>
      </div>

      <Tabs defaultValue="integrationen">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="integrationen" className="min-h-[44px]">Integrationen</TabsTrigger>
          <TabsTrigger value="branding" className="min-h-[44px]">Branding</TabsTrigger>
          <TabsTrigger value="benutzer" className="min-h-[44px]">Benutzer</TabsTrigger>
          <TabsTrigger value="benachrichtigungen" className="min-h-[44px]">Benachrichtigungen</TabsTrigger>
        </TabsList>

        {/* TAB 1: INTEGRATIONEN */}
        <TabsContent value="integrationen" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Close CRM */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <RefreshCw className="h-6 w-6 text-blue-400" aria-hidden="true" />
                <div className="flex-1">
                  <CardTitle className="text-base">Close CRM</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Deals werden via n8n synchronisiert</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label htmlFor="close-webhook">Webhook URL (n8n → Dashboard)</Label>
                <Input id="close-webhook" placeholder="https://n8n.example.com/webhook/close-sync" className="mt-1" /></div>
                <Button variant="outline" className="w-full min-h-[44px]" onClick={() => toast({ title: 'Sync angestoßen' })}>Manuell synchronisieren</Button>
                <p className="text-xs text-muted-foreground">Letzte Sync: –</p>
              </CardContent>
            </Card>

            {/* n8n */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-orange-400" aria-hidden="true" />
                <div className="flex-1">
                  <CardTitle className="text-base">n8n Automations</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Webhook-basierte Automatisierungen</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label htmlFor="n8n-url">Outgoing Webhook URL</Label>
                <Input id="n8n-url" placeholder="https://n8n.example.com/webhook/..." className="mt-1" /></div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Aktive Automationen:</p>
                  <p>• #abschlüsse → close_deals Tabelle</p>
                  <p>• #i-laufzeiten → Laufzeit-Alerts</p>
                </div>
                <Button variant="outline" className="w-full min-h-[44px]" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>

            {/* Google Drive */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <HardDrive className="h-6 w-6 text-primary" aria-hidden="true" />
                <div className="flex-1">
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {driveConnected ? <Badge className="bg-success/20 text-success text-xs"><CheckCircle className="h-3 w-3 mr-1" />Verbunden</Badge> : <Badge variant="secondary" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Nicht verbunden</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {driveConnected && driveEmail && <p className="text-sm text-muted-foreground">{driveEmail}</p>}
                <div><Label htmlFor="drive-root">Root-Ordner ID</Label><Input id="drive-root" placeholder="1abc..." className="mt-1" /></div>
                <Button variant="outline" className="w-full min-h-[44px]" onClick={() => toast({ title: 'Drive-Anbindung folgt' })}>
                  {driveConnected ? 'Ordnerstruktur aufbauen' : 'Google Drive verbinden'}
                </Button>
              </CardContent>
            </Card>

            {/* Meta Ads */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-blue-400" aria-hidden="true" />
                <div><CardTitle className="text-base">Meta Ads</CardTitle><p className="text-xs text-muted-foreground mt-1">Pro Kunde konfigurierbar</p></div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Ad Accounts werden pro Kunde in der Kundendetail-Ansicht (Tab "Meta Ads") verbunden.</p></CardContent>
            </Card>

            {/* OnePage.io */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Globe className="h-6 w-6 text-emerald-400" aria-hidden="true" />
                <CardTitle className="text-base">OnePage.io</CardTitle>
              </CardHeader>
              <CardContent>
                <div><Label htmlFor="onepage-key">API Key</Label><Input id="onepage-key" placeholder="op_key_..." className="mt-1" /></div>
                <Button variant="outline" className="w-full mt-3 min-h-[44px]" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>

            {/* Slack */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <MessageSquare className="h-6 w-6 text-purple-400" aria-hidden="true" />
                <div className="flex-1">
                  <CardTitle className="text-base">Slack</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">haushhaush.slack.com</p>
                </div>
              </CardHeader>
              <CardContent>
                <div><Label htmlFor="slack-channel">#abschlüsse Channel ID</Label><Input id="slack-channel" placeholder="C0123456..." className="mt-1" /></div>
                <Button variant="outline" className="w-full mt-3 min-h-[44px]" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: BRANDING */}
        <TabsContent value="branding" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Logo & Branding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Logo (für Rechnungen & Sidebar)</Label>
                <div className="mt-2 border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                  <p className="text-sm">Logo hierher ziehen oder klicken zum Hochladen</p>
                  <p className="text-xs mt-1">PNG, SVG bis 2MB</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Entity 1: Viral Connect */}
          <Card>
            <CardHeader><CardTitle className="text-base">Viral Connect GmbH</CardTitle><p className="text-xs text-muted-foreground">GF: Noah Mrosek</p></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Adresse</Label><Input placeholder="Musterstr. 1, 12345 Berlin" /></div>
                <div><Label>USt-ID</Label><Input placeholder="DE123456789" /></div>
                <div><Label>Steuernummer</Label><Input placeholder="12/345/67890" /></div>
                <div><Label>IBAN</Label><Input placeholder="DE89 3704 0044 0532 0130 00" /></div>
                <div><Label>BIC</Label><Input placeholder="COBADEFFXXX" /></div>
                <div><Label>Rechnungsnr.-Format</Label><Input value="VC-2026-001" readOnly className="bg-muted" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Entity 2: Haush Haush */}
          <Card>
            <CardHeader><CardTitle className="text-base">Haush Haush Digital UG</CardTitle><p className="text-xs text-muted-foreground">GF: Maximilian Büsse</p></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Adresse</Label><Input placeholder="Musterstr. 1, 12345 Berlin" /></div>
                <div><Label>USt-ID</Label><Input placeholder="DE123456789" /></div>
                <div><Label>Steuernummer</Label><Input placeholder="12/345/67890" /></div>
                <div><Label>IBAN</Label><Input placeholder="DE89 3704 0044 0532 0130 00" /></div>
                <div><Label>BIC</Label><Input placeholder="COBADEFFXXX" /></div>
                <div><Label>Rechnungsnr.-Format</Label><Input value="HH-2026-001" readOnly className="bg-muted" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: BENUTZER */}
        <TabsContent value="benutzer" className="mt-4 space-y-4">
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Benutzer & Rollen</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">E-Mail</TableHead>
                <TableHead scope="col">Rolle</TableHead>
                <TableHead scope="col">Abteilung</TableHead>
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
          <Button variant="outline" className="min-h-[44px]" onClick={() => toast({ title: 'Einladung wird gesendet' })}>
            <Users className="h-4 w-4 mr-2" />Per E-Mail einladen
          </Button>
        </TabsContent>

        {/* TAB 4: BENACHRICHTIGUNGEN */}
        <TabsContent value="benachrichtigungen" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Benachrichtigungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Neuer Abschluss (n8n)', desc: 'Benachrichtigt Admin + Customer Success', channels: ['In-App', 'Email'] },
                { label: 'Rechnung überfällig', desc: 'Nach 14 Tagen ohne Zahlung → Admin', channels: ['Email'] },
                { label: 'Laufzeit endet <14 Tage', desc: 'Benachrichtigt zugewiesenes Teammitglied', channels: ['In-App', 'Email'] },
                { label: 'Setter KPI Alert', desc: 'Show-up oder Close Rate unter Schwelle → Management', channels: ['Email'] },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <div className="flex gap-3">
                    {n.channels.map(c => (
                      <div key={c} className="flex items-center gap-1.5">
                        <Switch aria-label={`${n.label} ${c}`} />
                        <span className="text-xs text-muted-foreground">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
