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
import { HardDrive, Zap, Globe, Bell, Palette, Users, CheckCircle, XCircle, MessageSquare, RefreshCw, Hash } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Einstellungen() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('team').select('*').order('name'),
    ]).then(([driveRes, teamRes]) => {
      if (driveRes.data) { setDriveConnected(true); setDriveEmail(driveRes.data.google_email); }
      setTeam(teamRes.data || []);
      setLoading(false);
    });
  }, [user]);

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <Tabs defaultValue="integrationen">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="integrationen">Integrationen</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
          <TabsTrigger value="benachrichtigungen">Benachrichtigungen</TabsTrigger>
        </TabsList>

        <TabsContent value="integrationen" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Close CRM */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <RefreshCw className="h-6 w-6 text-blue-500" />
                <div className="flex-1"><CardTitle className="text-base">Close CRM</CardTitle><p className="text-xs text-muted-foreground mt-1">Deals via n8n</p></div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Webhook URL</Label><Input placeholder="https://n8n..." className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast({ title: 'Sync angestoßen' })}>Manuell synchronisieren</Button>
              </CardContent>
            </Card>

            {/* n8n */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-orange-500" />
                <div className="flex-1"><CardTitle className="text-base">n8n</CardTitle><p className="text-xs text-muted-foreground mt-1">Automatisierungen</p></div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Outgoing Webhook URL</Label><Input placeholder="https://n8n..." className="mt-1" /></div>
                <div className="text-xs text-muted-foreground"><p>• #abschlüsse → close_deals</p><p>• #i-laufzeiten → Alerts</p></div>
                <Button variant="outline" className="w-full" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>

            {/* Google Drive */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <HardDrive className="h-6 w-6 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {driveConnected ? <Badge className="bg-success/20 text-success text-xs"><CheckCircle className="h-3 w-3 mr-1" />Verbunden</Badge> : <Badge variant="secondary" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Nicht verbunden</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {driveEmail && <p className="text-sm text-muted-foreground">{driveEmail}</p>}
                <div><Label>Root-Ordner ID</Label><Input placeholder="1abc..." className="mt-1" /></div>
                <Button variant="outline" className="w-full">{driveConnected ? 'Ordnerstruktur aufbauen' : 'Verbinden'}</Button>
              </CardContent>
            </Card>

            {/* Meta Ads */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-blue-500" />
                <div><CardTitle className="text-base">Meta Ads</CardTitle><p className="text-xs text-muted-foreground mt-1">Pro Kunde konfigurierbar</p></div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Ad Accounts werden pro Kunde verbunden.</p></CardContent>
            </Card>

            {/* OnePage.io */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Globe className="h-6 w-6 text-emerald-500" />
                <div className="flex-1">
                  <CardTitle className="text-base">OnePage.io</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Landing Pages & Formulare</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>API Key</Label><Input type="password" placeholder="op_key_..." className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>

            {/* Slack */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Hash className="h-6 w-6 text-purple-500" />
                <div className="flex-1">
                  <CardTitle className="text-base">Slack</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">haushhaush.slack.com</p>
                  <Badge className="bg-success/20 text-success text-xs mt-1"><CheckCircle className="h-3 w-3 mr-1" />Verbunden</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Abschlüsse Channel</Label><Input defaultValue="C0AAN7SARLH" className="mt-1" /></div>
                <div><Label>Laufzeiten Channel</Label><Input defaultValue="C0AEKP0HNV8" className="mt-1" /></div>
                <div><Label>Buchhaltung Channel</Label><Input defaultValue="C0AA3R29KSP" className="mt-1" /></div>
                <Button variant="outline" className="w-full" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
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

        <TabsContent value="benutzer" className="mt-4 space-y-4">
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
                      <div key={c} className="flex items-center gap-1.5">
                        <Switch /><span className="text-xs text-muted-foreground">{c}</span>
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
