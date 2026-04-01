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
import { HardDrive, Zap, Globe, Bell, Palette, Users, CheckCircle, XCircle } from 'lucide-react';
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
      if (driveRes.data) {
        setDriveConnected(true);
        setDriveEmail(driveRes.data.google_email);
      }
      setTeam(teamRes.data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

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
            {/* Google Drive */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <HardDrive className="h-6 w-6 text-primary" aria-hidden="true" />
                <div className="flex-1">
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {driveConnected ? (
                      <Badge className="bg-success/20 text-success text-xs"><CheckCircle className="h-3 w-3 mr-1" />Verbunden</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Nicht verbunden</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {driveConnected && driveEmail && <p className="text-sm text-muted-foreground mb-3">{driveEmail}</p>}
                <Button variant="outline" className="w-full min-h-[44px]" onClick={() => toast({ title: 'Drive-Anbindung folgt' })}>
                  {driveConnected ? 'Ordnerstruktur aufbauen' : 'Google Drive verbinden'}
                </Button>
              </CardContent>
            </Card>

            {/* Meta Ads */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-blue-400" aria-hidden="true" />
                <div>
                  <CardTitle className="text-base">Meta Ads</CardTitle>
                  <Badge variant="secondary" className="text-xs mt-1">Konfigurierbar pro Kunde</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Ad Accounts werden pro Kunde in der Kundendetail-Ansicht verbunden.</p>
              </CardContent>
            </Card>

            {/* OnePage.io */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Globe className="h-6 w-6 text-emerald-400" aria-hidden="true" />
                <CardTitle className="text-base">OnePage.io</CardTitle>
              </CardHeader>
              <CardContent>
                <div><Label htmlFor="onepage-key">API Key</Label>
                <Input id="onepage-key" placeholder="op_key_..." className="mt-1" /></div>
                <Button variant="outline" className="w-full mt-3 min-h-[44px]" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>

            {/* n8n */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-3">
                <Zap className="h-6 w-6 text-orange-400" aria-hidden="true" />
                <CardTitle className="text-base">n8n Webhooks</CardTitle>
              </CardHeader>
              <CardContent>
                <div><Label htmlFor="n8n-url">Webhook URL</Label>
                <Input id="n8n-url" placeholder="https://n8n.example.com/webhook/..." className="mt-1" /></div>
                <Button variant="outline" className="w-full mt-3 min-h-[44px]" onClick={() => toast({ title: 'Gespeichert' })}>Speichern</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: BRANDING */}
        <TabsContent value="branding" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />Firmen-Branding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Logo (für Rechnungen & Sidebar)</Label>
                <div className="mt-2 border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                  <p className="text-sm">Logo hierher ziehen oder klicken zum Hochladen</p>
                  <p className="text-xs mt-1">PNG, SVG bis 2MB</p>
                </div>
              </div>
              <div>
                <Label>Billing Entity</Label>
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <Button variant="outline" className="flex-1 min-h-[44px]">Viral Connect GmbH</Button>
                  <Button variant="outline" className="flex-1 min-h-[44px]">Haush Haush Digital UG</Button>
                </div>
              </div>
              <div>
                <Label htmlFor="bank-iban">IBAN (für Rechnungs-PDF)</Label>
                <Input id="bank-iban" placeholder="DE89 3704 0044 0532 0130 00" className="mt-1" />
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
              </TableRow></TableHeader>
              <TableBody>
                {team.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{m.rolle}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
          <Button variant="outline" className="min-h-[44px]" onClick={() => toast({ title: 'Einladung', description: 'Email-Einladung wird gesendet' })}>
            <Users className="h-4 w-4 mr-2" />Per E-Mail einladen
          </Button>
        </TabsContent>

        {/* TAB 4: BENACHRICHTIGUNGEN */}
        <TabsContent value="benachrichtigungen" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />Email-Benachrichtigungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Kunde Ampel = Rot', desc: 'Bei Statusänderung auf Rot' },
                { label: 'Rechnung überfällig', desc: 'Nach 14 Tagen ohne Zahlung' },
                { label: 'Creative freigegeben', desc: 'Wenn Kunde Creative genehmigt' },
                { label: 'Setter Show-up Rate <60%', desc: 'Wöchentliche Warnung' },
                { label: 'Neue Aufgabe zugewiesen', desc: 'Bei Zuweisung einer Aufgabe' },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch aria-label={`${n.label} Benachrichtigung`} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
