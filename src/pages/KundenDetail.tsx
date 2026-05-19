import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DriveBrowser } from '@/components/DriveBrowser';
import { CloseDealDetailPanel } from '@/components/close/CloseDealDetailPanel';
import { ChevronLeft, ExternalLink, Mail, Phone, Building2, Tag, Save, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { getBranche } from '@/lib/branchen';

const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive' };
const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Lead': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Done': 'bg-muted text-muted-foreground',
};

const fmtMoney = (v: number | null | undefined) =>
  v == null ? '–' : `€${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '–';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return '–'; }
};
const fmtEur = (v: any): string => {
  if (v == null || v === '') return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v));
};
const getBrancheLabel = (id: string | null | undefined) => id ? (getBranche(id)?.label || id) : null;

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function InfoField({ label, value, type }: { label: string; value: any; type?: 'email' | 'phone' | 'url' }) {
  const empty = value == null || value === '';
  const labelEl = <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>;
  if (empty) {
    return <div>{labelEl}<p className="text-sm mt-0.5 text-muted-foreground">—</p></div>;
  }
  let content: React.ReactNode = <p className="text-sm mt-0.5 font-medium break-words">{value}</p>;
  if (type === 'email') {
    content = <a href={`mailto:${value}`} className="text-sm mt-0.5 font-medium text-primary hover:underline break-all block">{value}</a>;
  } else if (type === 'phone') {
    content = <a href={`tel:${value}`} className="text-sm mt-0.5 font-medium text-primary hover:underline block">{value}</a>;
  } else if (type === 'url') {
    const href = String(value).startsWith('http') ? value : `https://${value}`;
    content = (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm mt-0.5 font-medium text-primary hover:underline inline-flex items-center gap-1 break-all">
        {value} <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    );
  }
  return <div>{labelEl}{content}</div>;
}


export default function KundenDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'uebersicht';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [onepageProjects, setOnepageProjects] = useState<any[]>([]);
  const [websites, setWebsites] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [unternehmen, setUnternehmen] = useState<{ id: string; display_name: string } | null>(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ email: '', phone: '', branche_id: '', unternehmen_id: '', notes: '' });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [c, d, p, op, w, a, cam] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).maybeSingle(),
      supabase.from('close_deals').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('onepage_projects').select('*').eq('client_id_fk', id).order('created_at', { ascending: false }),
      supabase.from('referenz_showcase' as any).select('*').eq('linked_client_id', id).order('created_at', { ascending: false }),
      supabase.from('referenz_meta_ads').select('*').eq('linked_client_id', id).order('created_at', { ascending: false }),
      supabase.from('referenz_meta_campaigns').select('*').eq('linked_client_id', id).is('deleted_at', null).order('campaign_period_start', { ascending: false }),
    ]);
    const cli = c.data || null;
    setClient(cli);
    setDeals(d.data || []);
    setProjects(p.data || []);
    setOnepageProjects(op.data || []);
    setWebsites(w.data || []);
    setAds(a.data || []);
    setCampaigns(cam.data || []);

    if (cli?.unternehmen_id) {
      const { data: u } = await supabase.from('unternehmen').select('id, display_name').eq('id', cli.unternehmen_id).maybeSingle();
      setUnternehmen(u || null);
    }
    if (cli) {
      setEditForm({
        email: cli.email || '',
        phone: cli.phone || '',
        branche_id: cli.branche_id || '',
        unternehmen_id: cli.unternehmen_id || '',
        notes: cli.notes || '',
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const totals = useMemo(() => {
    const dealsValue = deals.reduce((s, x) => s + Number(x.wert_eur || 0), 0);
    return {
      dealCount: deals.length,
      dealValue: dealsValue,
      projectCount: projects.length,
      showcaseCount: websites.length,
    };
  }, [deals, projects, websites]);

  const activity = useMemo(() => {
    const items: { text: string; ts: string }[] = [];
    deals.forEach(d => items.push({ text: `Deal: ${d.client_name || ''} · ${d.status || ''}`, ts: d.updated_at || d.created_at }));
    projects.forEach(p => items.push({ text: `Projekt: ${p.name}`, ts: p.updated_at || p.created_at }));
    onepageProjects.forEach(o => items.push({ text: `Onepage-Lead: ${o.name}`, ts: o.updated_at || o.created_at }));
    websites.forEach(w => items.push({ text: `Showcase Website: ${w.titel || w.url || w.id}`, ts: w.updated_at || w.created_at }));
    ads.forEach(a => items.push({ text: `Showcase Ad: ${a.ad_name || a.id}`, ts: a.updated_at || a.created_at }));
    return items
      .filter(x => x.ts)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 5);
  }, [deals, projects, onepageProjects, websites, ads]);

  const handleSaveEdit = async () => {
    if (!id) return;
    const { error } = await supabase.from('clients').update({
      email: editForm.email || null,
      phone: editForm.phone || null,
      branche_id: editForm.branche_id || null,
      unternehmen_id: editForm.unternehmen_id || null,
      notes: editForm.notes || null,
    }).eq('id', id);
    if (error) {
      toast.error('Speichern fehlgeschlagen', { description: error.message });
      return;
    }
    toast.success('Kunde aktualisiert');
    setEditing(false);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/kunden')} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Zurück
        </Button>
        <p className="text-muted-foreground">Kunde nicht gefunden.</p>
      </div>
    );
  }

  const brancheLabel = client.branche_id
    ? getBranche(client.branche_id)?.label || client.branche_id
    : client.branche || null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/kunden')} className="gap-1 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Zurück zu Kunden
      </Button>

      {/* Master Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-heading font-bold">{client.name}</h1>
            <Badge variant="secondary" className={STATUS_STYLES[client.kundenstatus] || 'bg-muted'}>
              {client.kundenstatus}
            </Badge>
            <span className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_DOT[client.ampelstatus] || 'bg-muted'}`} aria-hidden />
              <span className="text-xs text-muted-foreground">{client.ampelstatus}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {brancheLabel && <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{brancheLabel}</span>}
            {unternehmen && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{unternehmen.display_name}</span>}
            {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="h-3.5 w-3.5" />{client.email}</a>}
            {client.phone && <a href={`tel:${client.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3.5 w-3.5" />{client.phone}</a>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold text-primary">{totals.dealCount}</p><p className="text-xs text-muted-foreground">Deals</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{fmtMoney(totals.dealValue)}</p><p className="text-xs text-muted-foreground">Gesamtwert</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{totals.projectCount}</p><p className="text-xs text-muted-foreground">Aktive Projekte</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xl font-heading font-bold">{totals.showcaseCount}</p><p className="text-xs text-muted-foreground">Showcase-Items</p></CardContent></Card>
      </div>

      {/* Edit Form */}
      {editing && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Kunde bearbeiten</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Email</label><Input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Telefon</label><Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Branche</label><Input value={editForm.branche_id} onChange={e => setEditForm({ ...editForm, branche_id: e.target.value })} placeholder="z.B. PKV" /></div>
              <div><label className="text-xs text-muted-foreground">Unternehmen-ID</label><Input value={editForm.unternehmen_id} onChange={e => setEditForm({ ...editForm, unternehmen_id: e.target.value })} placeholder="uuid" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Notizen</label><Textarea rows={4} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
            <Button size="sm" onClick={handleSaveEdit}><Save className="h-4 w-4 mr-1" /> Speichern</Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="deals">Deals ({deals.length})</TabsTrigger>
          <TabsTrigger value="onepage">Onepage-Leads ({onepageProjects.length})</TabsTrigger>
          <TabsTrigger value="showcase">Showcase ({totals.showcaseCount})</TabsTrigger>
          <TabsTrigger value="meta-ads">Meta Ads ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="projekte">Projekte ({projects.length})</TabsTrigger>
          <TabsTrigger value="dateien">Dateien</TabsTrigger>
        </TabsList>

        {/* ÜBERSICHT */}
        <TabsContent value="uebersicht" className="mt-4 space-y-4">
          {/* KPI-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="CLV" value={fmtEur(client.clv)} />
            <KpiCard label="Gesamt-Saldo" value={fmtEur(client.gesamt_saldo)} />
            <KpiCard label="Ads-Budget" value={fmtEur(client.ads_budget)} />
            <KpiCard label="Cash Collect offen" value={fmtEur(client.cash_collect_offen)} />
          </div>

          {/* Stammdaten */}
          <Card>
            <CardHeader><CardTitle className="text-base">Stammdaten</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <InfoField label="Name" value={client.name} />
              <InfoField label="Vor- & Nachname" value={client.vor_nachname} />
              <InfoField label="E-Mail" value={client.email} type="email" />
              <InfoField label="Telefon" value={client.phone} type="phone" />
              <InfoField label="Website" value={client.website_url} type="url" />
              <InfoField label="Branche" value={getBrancheLabel(client.branche_id) || client.branche} />
              <InfoField label="Unternehmen" value={unternehmen?.display_name} />
              <InfoField label="Meta Account ID" value={client.meta_account_id} />
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <InfoField label="Kundenstatus" value={client.kundenstatus} />
              <InfoField label="Ampel" value={client.ampelstatus} />
              <InfoField label="Zahlstatus" value={client.zahlstatus} />
            </CardContent>
          </Card>

          {/* Zeitraum & Laufzeit */}
          <Card>
            <CardHeader><CardTitle className="text-base">Zeitraum & Laufzeit</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <InfoField label="Startdatum" value={fmtDate(client.startdatum)} />
              <InfoField label="Enddatum" value={fmtDate(client.enddatum)} />
              <InfoField label="Deadline" value={fmtDate(client.deadline)} />
              <InfoField label="Laufzeit" value={client.laufzeit} />
              <InfoField label="Laufzeit in 14T" value={client.laufzeit_in_14t ? 'Ja' : 'Nein'} />
            </CardContent>
          </Card>

          {/* Kosten */}
          <Card>
            <CardHeader><CardTitle className="text-base">Kosten</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
              <InfoField label="Meta-Kosten" value={fmtEur(client.meta_kosten)} />
              <InfoField label="CRM-Kosten" value={fmtEur(client.crm_kosten)} />
              <InfoField label="Superchat-Kosten" value={fmtEur(client.superchat_kosten)} />
              <InfoField label="Website-Kosten" value={fmtEur(client.website_kosten)} />
            </CardContent>
          </Card>

          {/* Letzte Aktivität */}
          <Card>
            <CardHeader><CardTitle className="text-base">Letzte Aktivität</CardTitle></CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Aktivität.</p>
              ) : (
                <ul className="space-y-2">
                  {activity.map((a, i) => (
                    <li key={i} className="flex justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                      <span>{a.text}</span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-3">{fmtDate(a.ts)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {client.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notizen</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap text-muted-foreground">{client.notes}</p></CardContent>
            </Card>
          )}

          {client.notion_url && (
            <a
              href={client.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              In Notion öffnen
            </a>
          )}
        </TabsContent>

        {/* DEALS */}
        <TabsContent value="deals" className="mt-4">
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Art</TableHead><TableHead>Status</TableHead><TableHead>Wert</TableHead>
                <TableHead>Laufzeit</TableHead><TableHead>Startdatum</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {deals.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine Deals</TableCell></TableRow>
                ) : deals.map(d => (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenDealId(d.id)}>
                    <TableCell><Badge variant="outline">{d.art || '–'}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{d.status || '–'}</Badge></TableCell>
                    <TableCell className="font-medium">{fmtMoney(d.wert_eur)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.laufzeit || (d.laufzeit_monate ? `${d.laufzeit_monate} Mon.` : '–')}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(d.start_datum)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ONEPAGE LEADS */}
        <TabsContent value="onepage" className="mt-4 space-y-2">
          {onepageProjects.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Onepage-Leads</CardContent></Card>
          ) : onepageProjects.map(o => (
            <Card key={o.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <Link to={`/onepage-leads/kunden/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                  <p className="text-xs text-muted-foreground">{o.status}{o.page_url ? ` · ${o.page_url}` : ''}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* SHOWCASE */}
        <TabsContent value="showcase" className="mt-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Websites ({websites.length})</h3>
            {websites.length === 0 ? <p className="text-sm text-muted-foreground">Keine Websites</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {websites.map(w => (
                  <Link key={w.id} to={`/sales/referenz-showcase/websites/${w.id}`} className="block">
                    <Card className="hover:bg-muted/30 transition-colors">
                      <CardContent className="p-4">
                        <p className="font-medium truncate">{w.titel || w.url || w.id}</p>
                        <p className="text-xs text-muted-foreground truncate">{w.url || '–'}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* META ADS */}
        <TabsContent value="meta-ads" className="mt-4 space-y-3">
          {campaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Meta-Kampagnen verknüpft
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {campaigns.map((c: any) => {
                const metrics = c.metrics || {};
                const spend = metrics.spend ? Number(metrics.spend) : null;
                const impressions = metrics.impressions ? Number(metrics.impressions) : null;
                const reach = metrics.reach ? Number(metrics.reach) : null;
                const clicks = metrics.clicks ? Number(metrics.clicks) : null;
                const statusColor = c.meta_status === 'ACTIVE' ? 'bg-green-500/15 text-green-500'
                                  : c.meta_status === 'PAUSED' ? 'bg-yellow-500/15 text-yellow-500'
                                  : 'bg-muted text-muted-foreground';

                return (
                  <Link
                    key={c.id}
                    to={`/sales/referenz-showcase/kampagnen/${c.id}`}
                    className="block"
                  >
                    <Card className="hover:bg-muted/30 transition-colors h-full">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate" title={c.meta_campaign_name}>
                              {c.meta_campaign_name || c.meta_campaign_id}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {c.meta_account_name || c.meta_account_id}
                            </p>
                          </div>
                          {c.meta_status && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${statusColor}`}>
                              {c.meta_status}
                            </span>
                          )}
                        </div>

                        {/* Kampagnen-Metrics in 4er-Grid */}
                        <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t border-border/50">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Spend</p>
                            <p className="text-xs font-semibold">
                              {spend !== null ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(spend) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Reach</p>
                            <p className="text-xs font-semibold">
                              {reach !== null ? new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(reach) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Impr.</p>
                            <p className="text-xs font-semibold">
                              {impressions !== null ? new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(impressions) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Clicks</p>
                            <p className="text-xs font-semibold">
                              {clicks !== null ? new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(clicks) : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Anzeigen-Count + Zeitraum */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                          <span>{c.total_ads_count || 0} Anzeigen</span>
                          {c.campaign_period_start && (
                            <span>{fmtDate(c.campaign_period_start)} – {c.campaign_period_end ? fmtDate(c.campaign_period_end) : 'laufend'}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* PROJEKTE */}
        <TabsContent value="projekte" className="mt-4 space-y-2">
          {projects.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Projekte</CardContent></Card>
          ) : projects.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.projekttyp || '–'} · {fmtDate(p.startdatum)}</p>
                  </div>
                  <Badge variant="secondary">{p.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* DATEIEN */}
        <TabsContent value="dateien" className="mt-4">
          <DriveBrowser folderId={id} showUpload showPin folderChips={['Ad Creatives', 'Berichte', 'Verträge', 'Sonstiges']} />
        </TabsContent>
      </Tabs>

      <CloseDealDetailPanel dealId={openDealId} open={!!openDealId} onOpenChange={(o) => !o && setOpenDealId(null)} />
    </div>
  );
}
