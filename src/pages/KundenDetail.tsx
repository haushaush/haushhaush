import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { DriveBrowser } from '@/components/DriveBrowser';
import { KundenBudgetCard } from '@/components/finanzen/KundenBudgetCard';
import { ChevronLeft, ChevronDown, ExternalLink, Plus, CalendarPlus, AlertTriangle, BarChart3, Star, Target } from 'lucide-react';
import { useMetaInsights } from '@/hooks/useMetaInsights';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';

const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive' };
const STATUS_STYLES: Record<string, string> = {
  'Aktiv': 'bg-success/20 text-success', 'Pausiert': 'bg-warning/20 text-warning',
  'Churned': 'bg-destructive/20 text-destructive',
};

export default function KundenDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'uebersicht';
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdminOrManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [updates, setUpdates] = useState<{ text: string; ts: string }[]>([]);
  const [newUpdate, setNewUpdate] = useState('');
  const [metaAccountId, setMetaAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [d, tk, p, inv, rec, t] = await Promise.all([
        supabase.from('close_deals').select('*').eq('id', id).single(),
        supabase.from('tasks').select('*').eq('client_id', id).order('due_date', { ascending: true }),
        supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').eq('close_deal_id', id).order('created_at', { ascending: false }),
        supabase.from('recurring_revenues').select('*').eq('close_deal_id', id),
        supabase.from('team').select('id, name'),
      ]);
      if (d.data) {
        setDeal(d.data);
        // Load notes from deal
        if (Array.isArray(d.data.notes)) {
          setUpdates(d.data.notes as any[]);
        }
      }
      setTasks(tk.data || []);
      setProjects(p.data || []);
      setInvoices(inv.data || []);
      setRecurring(rec.data || []);
      setTeam(t.data || []);
      setLoading(false);
    };
    load();
  }, [id]);

  // Load Meta account mapping for this deal
  useEffect(() => {
    const loadMetaMapping = async () => {
      const { data: setting } = await supabase
        .from('integration_settings')
        .select('config')
        .eq('provider', 'meta_ads')
        .maybeSingle();
      
      if (setting?.config) {
        const cfg = setting.config as any;
        if (cfg.account_mappings) {
          const mappings = cfg.account_mappings as Record<string, string>;
          const accountId = Object.entries(mappings).find(([, dealId]) => dealId === id)?.[0];
          if (accountId) setMetaAccountId(accountId);
        }
      }
    };
    if (id) loadMetaMapping();
  }, [id]);

  const metaInsights = useMetaInsights({ adAccountId: metaAccountId || undefined });
  const metaSpend = metaInsights.data.reduce((s: number, r: any) => s + Number(r.spend || 0), 0);
  const metaLeads = metaInsights.data.reduce((s: number, r: any) => s + Number(r.leads || 0), 0);
  const metaCpl = metaLeads > 0 ? metaSpend / metaLeads : 0;

  const getName = (tid: string | null) => team.find(t => t.id === tid)?.name || '–';
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.brutto || 0), 0);
  const totalPaid = invoices.filter(i => i.status === 'Bezahlt').reduce((s, i) => s + Number(i.brutto || 0), 0);
  const mrr = recurring.reduce((s, r) => s + Number(r.monthly_amount || 0), 0);

  // Laufzeit progress
  const laufzeitProgress = useMemo(() => {
    if (!deal?.start_datum || !deal?.laufzeit_monate) return null;
    const start = new Date(deal.start_datum).getTime();
    const end = new Date(deal.start_datum);
    end.setMonth(end.getMonth() + deal.laufzeit_monate);
    const total = end.getTime() - start;
    const elapsed = Date.now() - start;
    return { pct: Math.min(100, Math.max(0, (elapsed / total) * 100)), endDate: end.toLocaleDateString('de-DE') };
  }, [deal]);

  const addUpdate = async () => {
    if (!newUpdate.trim() || !id) return;
    const newNote = { text: newUpdate.trim(), ts: new Date().toLocaleString('de-DE') };
    const updated = [newNote, ...updates];
    setUpdates(updated);
    setNewUpdate('');
    await supabase.from('close_deals').update({ notes: updated }).eq('id', id);
    toast({ title: 'Update hinzugefügt' });
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;

  if (!deal) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/kunden')} className="gap-1"><ChevronLeft className="h-4 w-4" /> Zurück</Button>
        <p className="text-muted-foreground">Deal nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/kunden')} className="gap-1 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Zurück zu Kunden
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-heading font-bold">{deal.client_name}</h1>
            <Badge variant="outline" className="text-xs">{deal.art}</Badge>
            <Badge variant="secondary" className={STATUS_STYLES[deal.status]}>{deal.status}</Badge>
            <span className="flex items-center gap-1.5" aria-label={`Ampelstatus: ${deal.ampelstatus}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_DOT[deal.ampelstatus]}`} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{deal.ampelstatus}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>€{Number(deal.wert_eur || 0).toLocaleString('de-DE')}</span>
            {deal.laufzeit_monate && <span>{deal.laufzeit_monate} Monate{laufzeitProgress ? ` · endet ${laufzeitProgress.endDate}` : ''}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {deal.close_opportunity_url && (
            <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => window.open(deal.close_opportunity_url, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-1" />Close CRM
            </Button>
          )}
          {deal.onepage_url && (
            <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => window.open(deal.onepage_url, '_blank')}>
              <ExternalLink className="h-4 w-4 mr-1" />OnePage
            </Button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold text-primary">€{Number(deal.wert_eur || 0).toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Deal-Wert</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{projects.length}</p><p className="text-xs text-muted-foreground">Projekte</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{tasks.filter(t => t.status !== 'Erledigt').length}</p><p className="text-xs text-muted-foreground">Offene Aufgaben</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">€{mrr.toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">MRR</p></CardContent></Card>
      </div>

      {laufzeitProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Laufzeit</span><span>{laufzeitProgress.pct.toFixed(0)}%</span>
          </div>
          <Progress value={laufzeitProgress.pct} className="h-2" />
        </div>
      )}

      {/* 7 Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht" className="min-h-[44px]">Übersicht</TabsTrigger>
          <TabsTrigger value="projekte" className="min-h-[44px]">Projekte ({projects.length})</TabsTrigger>
          <TabsTrigger value="aufgaben" className="min-h-[44px]">Aufgaben ({tasks.length})</TabsTrigger>
          <TabsTrigger value="cs" className="min-h-[44px]">Customer Success</TabsTrigger>
          <TabsTrigger value="dateien" className="min-h-[44px]">Dateien</TabsTrigger>
          <TabsTrigger value="finanzen" className="min-h-[44px]">Finanzen</TabsTrigger>
          <TabsTrigger value="metaads" className="min-h-[44px]">Meta Ads</TabsTrigger>
        </TabsList>

        {/* TAB 1: ÜBERSICHT */}
        <TabsContent value="uebersicht" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Kundeninfo</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Art</span><span>{deal.art}</span>
                <span className="text-muted-foreground">Deal-Typ</span><span>{deal.deal_type}</span>
                <span className="text-muted-foreground">Zugewiesen</span><span>{getName(deal.assigned_to)}</span>
                <span className="text-muted-foreground">Zahlstatus</span><span>{deal.zahlstatus || '–'}</span>
                <span className="text-muted-foreground">Health Score</span>
                <span className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className={`h-4 w-4 ${i <= (deal.health_score || 3) ? 'text-primary fill-primary' : 'text-muted'}`} />)}</span>
              </div>
            </CardContent>
          </Card>

          {Array.isArray(deal.leistungen) && deal.leistungen.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Leistungen</CardTitle></CardHeader>
              <CardContent><div className="flex flex-wrap gap-2">{deal.leistungen.map((l: string, i: number) => <Badge key={i} variant="secondary">{l}</Badge>)}</div></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Roadmap</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Onboarding & Zugänge einrichten</li>
                <li>Kampagnen-Setup & Launch</li>
                <li>Optimierung & Skalierung</li>
              </ol>
            </CardContent>
          </Card>

          <Collapsible>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Zugänge & Tools</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <p>Meta Business Manager: –</p><p>Google Ads: –</p>
                    <p>CRM-Zugang: –</p><p>Analytics: –</p>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Card>
            <CardHeader><CardTitle className="text-base">Wichtige Updates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Update hinzufügen..." value={newUpdate} onChange={e => setNewUpdate(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUpdate()} />
                <Button size="sm" onClick={addUpdate} className="min-h-[44px]">Hinzufügen</Button>
              </div>
              {updates.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Updates.</p>}
              {updates.map((u, i) => (
                <div key={i} className="border border-border rounded-md p-3">
                  <p className="text-sm">{u.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{u.ts}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: PROJEKTE */}
        <TabsContent value="projekte" className="mt-4 space-y-4">
          {isAdminOrManager && (
            <Button variant="outline" className="min-h-[44px]" onClick={() => toast({ title: 'Projekt erstellen', description: 'Wird mit diesem Kunden verknüpft' })}>
              <Plus className="h-4 w-4 mr-1" />Neues Projekt
            </Button>
          )}
          {projects.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Projekte</CardContent></Card>
          ) : projects.map(p => (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.projekttyp || '–'} · {p.startdatum || '–'}</p></div>
                  <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Ads Budget</span><p className="font-medium">€{Number(p.ads_budget || 0).toLocaleString('de-DE')}</p></div>
                  <div><span className="text-muted-foreground">Laufzeit</span><p className="font-medium">{p.startdatum || '–'}</p></div>
                  <div><span className="text-muted-foreground">Saldo</span><p className="font-medium">€{Number(p.gesamt_saldo || 0).toLocaleString('de-DE')}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* TAB 3: AUFGABEN */}
        <TabsContent value="aufgaben" className="mt-4">
          {isAdminOrManager && (
            <Button variant="outline" className="min-h-[44px] mb-4" onClick={() => toast({ title: 'Aufgabe erstellen' })}>
              <Plus className="h-4 w-4 mr-1" />Neue Aufgabe
            </Button>
          )}
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Aufgaben für {deal.client_name}</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Aufgabe</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Zugewiesen</TableHead>
                <TableHead scope="col">Geplant</TableHead><TableHead scope="col">Fällig</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine Aufgaben</TableCell></TableRow>
                ) : tasks.map(t => {
                  const overdue = t.status !== 'Erledigt' && t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{t.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{getName(t.assignee_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{Number(t.geplante_zeit || 0).toFixed(1)}h</TableCell>
                      <TableCell className={overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {t.due_date || '–'}{overdue && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        {/* TAB 4: CUSTOMER SUCCESS */}
        <TabsContent value="cs" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Health Score</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-1">{[1,2,3,4,5].map(i => <Star key={i} className={`h-6 w-6 cursor-pointer ${i <= (deal.health_score || 3) ? 'text-primary fill-primary' : 'text-muted'}`} />)}</div>
            </CardContent>
          </Card>
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <CalendarPlus className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
            <p className="font-medium">Meeting-Protokolle & Next Steps</p>
            <p className="text-sm mt-1">Meetings mit Datum, Thema, Teilnehmern und Notizen.</p>
            <Button variant="outline" className="mt-4 min-h-[44px]" onClick={() => toast({ title: 'Meeting geloggt' })}>
              <Plus className="h-4 w-4 mr-1" />Meeting loggen
            </Button>
          </CardContent></Card>
        </TabsContent>

        {/* TAB 5: DATEIEN */}
        <TabsContent value="dateien" className="mt-4">
          <DriveBrowser folderId={id} showUpload={true} showPin={true} folderChips={['Ad Creatives', 'Berichte', 'Verträge', 'Sonstiges']} />
        </TabsContent>

        {/* TAB 6: FINANZEN */}
        <TabsContent value="finanzen" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-heading font-bold text-success">€{totalPaid.toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Bezahlt</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-heading font-bold text-destructive">€{(totalInvoiced - totalPaid).toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">Offen</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-heading font-bold text-primary">€{mrr.toLocaleString('de-DE')}</p><p className="text-xs text-muted-foreground">MRR</p></CardContent></Card>
          </div>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Rechnungen für {deal.client_name}</caption>
              <TableHeader><TableRow>
                <TableHead scope="col">Nr.</TableHead><TableHead scope="col">Brutto</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Fällig</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Keine Rechnungen</TableCell></TableRow>
                ) : invoices.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoice_nr}</TableCell>
                    <TableCell className="font-medium">€{Number(i.brutto || 0).toLocaleString('de-DE')}</TableCell>
                    <TableCell><Badge variant={i.status === 'Bezahlt' ? 'secondary' : 'destructive'} className="text-xs">{i.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{i.faelligkeitsdatum || '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>

          {/* Werbebudget Card */}
          <KundenBudgetCard dealId={id!} clientName={deal.client_name} />
        </TabsContent>

        {/* TAB 7: META ADS */}
        <TabsContent value="metaads" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Meta Ads</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Ad Account ID</p>
                <Input value={deal.meta_ad_account_id || ''} placeholder="act_123456..." readOnly />
              </div>
              {deal.meta_ad_account_id ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Live-Daten werden mit Meta API Anbindung verfügbar.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="min-h-[44px]" onClick={() => toast({ title: 'KI Analyse', description: 'Meta API Anbindung erforderlich' })}>KI Analyse</Button>
                    <Button variant="outline" className="min-h-[44px]" onClick={() => window.open('https://adsmanager.facebook.com', '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-1" />In Meta öffnen
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Kein Ad Account verknüpft. In Einstellungen → Integrationen konfigurieren.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
