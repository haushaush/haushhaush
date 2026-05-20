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
import { ChevronLeft, ChevronDown, ExternalLink, Mail, Phone, Building2, Tag, Save, Pencil, X, Loader2, AlertCircle, AlertTriangle, Cloud, RefreshCw, Mail as MailIcon, PhoneCall, StickyNote, Calendar as CalIcon, MessageSquare, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { getBranche } from '@/lib/branchen';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import ProjekteSlidePanel from '@/components/projekte/ProjekteSlidePanel';
import { BranchePicker } from '@/components/pickers/BranchePicker';
import { UnternehmenPicker } from '@/components/pickers/UnternehmenPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const KUNDENSTATUS_OPTIONS = ['Lead', 'In Betreuung', 'Pausiert', 'Churned'];
const AMPEL_OPTIONS = ['Grün', 'Gelb', 'Rot', 'CC'];
const ZAHLSTATUS_OPTIONS = ['Offen', 'In Bearbeitung', 'Rechnung zu erstellen', 'VC an HHS', 'DONE'];

const EDITABLE_FIELDS = [
  'name','vor_nachname','email','phone','website_url','branche_id','unternehmen_id',
  'kundenstatus','ampelstatus','zahlstatus',
  'ads_budget','gesamt_saldo','cash_collect_offen','meta_kosten','crm_kosten','superchat_kosten','website_kosten',
  'deadline','startdatum','enddatum','laufzeit_in_14t','notes',
] as const;
type EditableField = typeof EDITABLE_FIELDS[number];
type EditForm = Record<EditableField, any>;

const emptyForm = (): EditForm => EDITABLE_FIELDS.reduce((a, k) => ({ ...a, [k]: '' }), {} as EditForm);
const formFromClient = (c: any): EditForm => EDITABLE_FIELDS.reduce((a, k) => {
  const v = c?.[k];
  (a as any)[k] = v == null ? (k === 'laufzeit_in_14t' ? false : '') : v;
  return a;
}, {} as EditForm);

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
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Close.com direct sync data
  const [closeOpps, setCloseOpps] = useState<any[]>([]);
  const [closeActs, setCloseActs] = useState<any[]>([]);
  const [closeLink, setCloseLink] = useState<any | null>(null);
  const [closeLead, setCloseLead] = useState<any | null>(null);
  const [closeContacts, setCloseContacts] = useState<any[]>([]);
  const [closeTasks, setCloseTasks] = useState<any[]>([]);
  const [expandedActId, setExpandedActId] = useState<string | null>(null);
  const [closeSyncing, setCloseSyncing] = useState(false);
  const [oppFilter, setOppFilter] = useState<'won' | 'all'>('won');
  const [actFilter, setActFilter] = useState<string>('all');

  const { callMeta } = useMetaAds();
  const [liveCampaigns, setLiveCampaigns] = useState<any[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    if (!client?.meta_account_id) {
      setLiveCampaigns([]);
      return;
    }
    const raw = String(client.meta_account_id);
    const accountId = raw.startsWith('act_') ? raw : `act_${raw}`;

    setLiveLoading(true);
    setLiveError(null);
    callMeta<any>(`/${accountId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights{spend,impressions,reach,clicks,ctr,cpc}',
      limit: 50,
    })
      .then((data: any) => setLiveCampaigns(data?.data || []))
      .catch((e: Error) => {
        setLiveError(e.message);
        console.error('Meta API fetch failed:', e);
      })
      .finally(() => setLiveLoading(false));
  }, [client?.meta_account_id, callMeta]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    // 1. Erst client laden, um notion_id für Projekt-Query zu erhalten
    const { data: cli } = await supabase.from('clients').select('*, unternehmen:unternehmen_id(id, name, display_name)').eq('id', id).maybeSingle();
    setClient(cli || null);

    // 2. Projekt-Query: über client_id ODER notion_id-Array (verknuepfte_kunden_ids)
    const projectsQuery = cli?.notion_id
      ? supabase.from('projects')
          .select('*')
          .or(`client_id.eq.${id},verknuepfte_kunden_ids.cs.{${cli.notion_id}}`)
          .order('created_at', { ascending: false })
      : supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false });

    // Multi-Strategy OR-Filter für meta ads/campaigns (linked_client_id ODER meta_account_id)
    const buildMetaConditions = () => {
      const set = new Set<string>([`linked_client_id.eq.${id}`]);
      if (cli?.meta_account_id) {
        const raw = String(cli.meta_account_id).replace(/^act_/, '');
        set.add(`meta_account_id.eq.${raw}`);
        set.add(`meta_account_id.eq.act_${raw}`);
      }
      return Array.from(set).join(',');
    };

    const adsQuery = cli
      ? supabase.from('referenz_meta_ads').select('*').or(buildMetaConditions()).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] } as any);
    const campaignsQuery = cli
      ? supabase.from('referenz_meta_campaigns').select('*').or(buildMetaConditions()).order('campaign_period_start', { ascending: false })
      : Promise.resolve({ data: [] } as any);

    const [d, p, op, w, a, cam, link, opps, acts, lead, contacts, tasks] = await Promise.all([
      supabase.from('close_deals').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      projectsQuery,
      supabase.from('onepage_projects').select('*').eq('client_id_fk', id).order('created_at', { ascending: false }),
      supabase.from('referenz_showcase' as any).select('*').eq('linked_client_id', id).order('created_at', { ascending: false }),
      adsQuery,
      campaignsQuery,
      supabase.from('close_link' as any).select('*').eq('client_id', id).maybeSingle(),
      supabase.from('close_opportunities' as any).select('*').eq('client_id', id).order('date_won', { ascending: false, nullsFirst: false }),
      supabase.from('close_activities' as any).select('*').eq('client_id', id).order('date_created', { ascending: false }).limit(200),
      supabase.from('close_leads' as any).select('*').eq('client_id', id).maybeSingle(),
      supabase.from('close_contacts' as any).select('*').eq('client_id', id).order('date_created', { ascending: true }),
      supabase.from('close_tasks' as any).select('*').eq('client_id', id).order('is_complete', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false }),
    ]);
    setDeals(d.data || []);
    setProjects(p.data || []);
    setOnepageProjects(op.data || []);
    const allShowcase = (w.data || []) as any[];
    setWebsites(allShowcase.filter((s: any) => s.type === 'website'));
    setAds(a.data || []);
    setCampaigns(cam.data || []);
    setCloseLink(link?.data || null);
    setCloseOpps((opps as any)?.data || []);
    setCloseActs((acts as any)?.data || []);
    setCloseLead((lead as any)?.data || null);
    setCloseContacts((contacts as any)?.data || []);
    setCloseTasks((tasks as any)?.data || []);
    // eslint-disable-next-line no-console
    console.log('[KundenDetail] Showcase ads loaded:', (a.data || []).length, 'for client:', id, {
      conditions: buildMetaConditions(),
      adsError: (a as any).error,
      campaignsError: (cam as any).error,
      clientMetaAccountId: cli?.meta_account_id,
    });

    if (cli?.unternehmen) {
      setUnternehmen({ id: cli.unternehmen.id, display_name: cli.unternehmen.display_name || cli.unternehmen.name });
    } else if (cli?.unternehmen_id) {
      const { data: u } = await supabase.from('unternehmen').select('id, display_name').eq('id', cli.unternehmen_id).maybeSingle();
      setUnternehmen(u || null);
    }
    if (cli) {
      setEditForm(formFromClient(cli));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const totals = useMemo(() => {
    const dealsValue = deals.reduce((s, x) => s + Number(x.wert_eur || 0), 0);
    return {
      dealCount: deals.length,
      dealValue: dealsValue,
      projectCount: projects.filter(p => ['In Bearbeitung', 'Aktiv', 'Laufzeitbetreuung'].includes(p.projektstatus || p.status)).length,
      showcaseCount: websites.length + ads.length,
    };
  }, [deals, projects, websites, ads]);

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

  // ===== Close.com helpers =====
  const closeStats = useMemo(() => {
    const won = closeOpps.filter((o: any) => o.status_type === 'won');
    const active = closeOpps.filter((o: any) => o.status_type === 'active');
    const wonSum = won.reduce((s, o) => s + Number(o.value_cents || 0), 0) / 100;
    const lastWon = won.reduce((m: string | null, o: any) => {
      if (!o.date_won) return m;
      if (!m || new Date(o.date_won) > new Date(m)) return o.date_won;
      return m;
    }, null);
    return { wonCount: won.length, wonSum, lastWon, activeCount: active.length };
  }, [closeOpps]);

  const filteredOpps = useMemo(
    () => oppFilter === 'won' ? closeOpps.filter((o: any) => o.status_type === 'won') : closeOpps,
    [closeOpps, oppFilter]
  );

  const filteredActs = useMemo(() => {
    if (actFilter === 'all') return closeActs;
    return closeActs.filter((a: any) => (a.activity_type || '').toLowerCase().includes(actFilter.toLowerCase()));
  }, [closeActs, actFilter]);

  const syncFreshness = useMemo(() => {
    if (!closeLink?.last_synced_at) return { color: 'destructive', label: 'Close: kein Sync' } as const;
    const ageH = (Date.now() - new Date(closeLink.last_synced_at).getTime()) / 3600000;
    if (ageH < 36) return { color: 'success', label: `Close synct (${fmtDate(closeLink.last_synced_at)})` } as const;
    if (ageH < 72) return { color: 'warning', label: `Close: Sync alt (${fmtDate(closeLink.last_synced_at)})` } as const;
    return { color: 'destructive', label: `Close: Sync veraltet (${fmtDate(closeLink.last_synced_at)})` } as const;
  }, [closeLink]);

  const handleResyncClose = async () => {
    if (!closeLink?.close_lead_id) {
      toast.error('Kein Close-Link — bitte erst verlinken (Admin → Close-Sync).');
      return;
    }
    setCloseSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-close-lead-full', { body: { client_id: id } });
      if (error) throw error;
      const s = data?.stats || {};
      toast.success(`Close-Sync OK · ${s.opportunities ?? 0} Deals, ${s.activities ?? 0} Aktivitäten, ${s.contacts ?? 0} Kontakte, ${s.tasks ?? 0} Tasks`);
      await load();
    } catch (e: any) {
      toast.error(`Close-Sync fehlgeschlagen: ${e.message}`);
    } finally {
      setCloseSyncing(false);
    }
  };

  const handleUnlinkClose = async () => {
    if (!closeLink?.client_id) return;
    if (!confirm('Verknüpfung zu Close.com wirklich lösen?')) return;
    try {
      const { error } = await supabase.from('close_link' as any).delete().eq('client_id', closeLink.client_id);
      if (error) throw error;
      toast.success('Verknüpfung gelöst');
      await load();
    } catch (e: any) {
      toast.error(`Lösen fehlgeschlagen: ${e.message}`);
    }
  };

  const activityIcon = (type: string | null) => {
    const t = (type || '').toLowerCase();
    if (t.includes('email')) return <MailIcon className="h-3.5 w-3.5" />;
    if (t.includes('call')) return <PhoneCall className="h-3.5 w-3.5" />;
    if (t.includes('note')) return <StickyNote className="h-3.5 w-3.5" />;
    if (t.includes('meeting')) return <CalIcon className="h-3.5 w-3.5" />;
    if (t.includes('sms')) return <MessageSquare className="h-3.5 w-3.5" />;
    return <Activity className="h-3.5 w-3.5" />;
  };

  const NUMBER_FIELDS: EditableField[] = ['ads_budget','gesamt_saldo','cash_collect_offen','meta_kosten','crm_kosten','superchat_kosten','website_kosten'];
  const DATE_FIELDS: EditableField[] = ['deadline','startdatum','enddatum'];

  const normalize = (k: EditableField, v: any): any => {
    if (v === '' || v == null) return null;
    if (NUMBER_FIELDS.includes(k)) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (k === 'laufzeit_in_14t') return !!v;
    return v;
  };

  const handleSaveEdit = async () => {
    if (!id || !client) return;
    if (client.deleted_at) {
      toast.error('Soft-deleted, zuerst wiederherstellen');
      return;
    }
    setSaving(true);
    try {
      // Concurrent-Update-Check
      const { data: latest, error: chkErr } = await supabase
        .from('clients').select('updated_at').eq('id', id).single();
      if (chkErr) throw chkErr;
      if (latest?.updated_at && client.updated_at && latest.updated_at !== client.updated_at) {
        toast.error('Daten wurden zwischenzeitlich geändert, bitte neu laden');
        setSaving(false);
        return;
      }

      // Diff: nur geänderte Felder
      const patch: Record<string, any> = {};
      for (const k of EDITABLE_FIELDS) {
        const next = normalize(k, editForm[k]);
        const prev = client[k] ?? (k === 'laufzeit_in_14t' ? false : null);
        const prevNorm = prev === '' ? null : prev;
        if (JSON.stringify(next) !== JSON.stringify(prevNorm)) {
          patch[k] = next;
        }
      }
      if (Object.keys(patch).length === 0) {
        toast.info('Keine Änderungen');
        setEditing(false);
        setSaving(false);
        return;
      }

      // Optimistic Update
      const prevClient = client;
      setClient({ ...client, ...patch });

      const { error } = await supabase.from('clients').update(patch as any).eq('id', id);
      if (error) {
        setClient(prevClient);
        toast.error('Fehler beim Speichern: ' + error.message, { description: (error as any).hint || undefined });
        setSaving(false);
        return;
      }
      toast.success('Gespeichert');
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error('Fehler beim Speichern: ' + (e?.message || 'unbekannt'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (k: EditableField, v: any) => setEditForm(f => ({ ...f, [k]: v }));

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
            <button
              type="button"
              onClick={handleResyncClose}
              disabled={closeSyncing}
              title="Klick: Close-Sync manuell auslösen"
              className={`inline-flex items-center gap-1.5 text-[11px] rounded-full px-2.5 py-1 border transition-colors disabled:opacity-60 ${
                syncFreshness.color === 'success' ? 'bg-success/10 border-success/30 text-success hover:bg-success/20' :
                syncFreshness.color === 'warning' ? 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/20' :
                'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20'
              }`}
            >
              {closeSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span>{syncFreshness.label}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {brancheLabel && <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{brancheLabel}</span>}
            {unternehmen && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{unternehmen.display_name}</span>}
            {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="h-3.5 w-3.5" />{client.email}</a>}
            {client.phone && <a href={`tel:${client.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3.5 w-3.5" />{client.phone}</a>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditForm(formFromClient(client)); }} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Abbrechen
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Speichern
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setEditForm(formFromClient(client)); setEditing(true); }}
              disabled={!!client.deleted_at}
              title={client.deleted_at ? 'Soft-deleted, zuerst wiederherstellen' : ''}
            >
              <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
            </Button>
          )}
          {client.notion_id && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-warning/10 border border-warning/30 rounded-full px-2.5 py-1">
              <AlertTriangle className="h-3 w-3 text-warning" />
              <span>Notion-synct: Edits werden ggf. beim nächsten Sync überschrieben.</span>
            </div>
          )}
        </div>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Kunde bearbeiten</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditForm(formFromClient(client)); }} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Abbrechen
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Speichern
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {client.notion_id && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Dieser Kunde wird mit Notion synchronisiert.</p>
                  <p className="text-muted-foreground mt-0.5">
                    Bearbeite die unten markierten Felder lieber direkt in Notion — sonst werden deine Änderungen beim nächsten Sync überschrieben. Nicht-gesyncte Felder (z.B. Notizen) bleiben erhalten.
                  </p>
                  {client.notion_url && (
                    <a
                      href={client.notion_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-primary hover:underline"
                    >
                      In Notion öffnen <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
            {/* Stammdaten */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">Stammdaten {client.notion_id && <Cloud className="h-3 w-3 text-warning" aria-label="Wird aus Notion gesynct — Änderungen werden beim nächsten Sync überschrieben"><title>Wird aus Notion gesynct — Änderungen werden beim nächsten Sync überschrieben</title></Cloud>}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">Name</label><Input value={editForm.name} onChange={e => updateField('name', e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Vor- & Nachname</label><Input value={editForm.vor_nachname} onChange={e => updateField('vor_nachname', e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">E-Mail</label><Input type="email" value={editForm.email} onChange={e => updateField('email', e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Telefon</label><Input value={editForm.phone} onChange={e => updateField('phone', e.target.value)} /></div>
                <div className="sm:col-span-2"><label className="text-xs text-muted-foreground">Website</label><Input value={editForm.website_url} onChange={e => updateField('website_url', e.target.value)} placeholder="https://…" /></div>
                <div>
                  <label className="text-xs text-muted-foreground">Branche</label>
                  <BranchePicker value={editForm.branche_id || null} onChange={(v) => updateField('branche_id', v || '')} compact />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Unternehmen</label>
                  <UnternehmenPicker value={editForm.unternehmen_id || null} onChange={(v) => updateField('unternehmen_id', v || '')} compact />
                </div>
              </div>
            </section>

            {/* Status & Ampel */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">Status {client.notion_id && <Cloud className="h-3 w-3 text-warning"><title>Wird aus Notion gesynct — Änderungen werden beim nächsten Sync überschrieben</title></Cloud>}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Kundenstatus</label>
                  <Select value={editForm.kundenstatus || ''} onValueChange={(v) => updateField('kundenstatus', v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{KUNDENSTATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Ampel</label>
                  <Select value={editForm.ampelstatus || ''} onValueChange={(v) => updateField('ampelstatus', v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{AMPEL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Zahlstatus</label>
                  <Select value={editForm.zahlstatus || ''} onValueChange={(v) => updateField('zahlstatus', v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{ZAHLSTATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Finanzen */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">Finanzen (€) {client.notion_id && <Cloud className="h-3 w-3 text-warning"><title>Wird aus Notion gesynct — Änderungen werden beim nächsten Sync überschrieben</title></Cloud>}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {NUMBER_FIELDS.map(k => (
                  <div key={k}>
                    <label className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</label>
                    <Input type="number" min={0} step="0.01" value={editForm[k] ?? ''} onChange={e => updateField(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </section>

            {/* Zeitraum */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">Zeitraum {client.notion_id && <Cloud className="h-3 w-3 text-warning"><title>Wird aus Notion gesynct — Änderungen werden beim nächsten Sync überschrieben</title></Cloud>}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-xs text-muted-foreground">Startdatum</label><Input type="date" value={editForm.startdatum || ''} onChange={e => updateField('startdatum', e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Enddatum</label><Input type="date" value={editForm.enddatum || ''} onChange={e => updateField('enddatum', e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Deadline</label><Input type="date" value={editForm.deadline || ''} onChange={e => updateField('deadline', e.target.value)} /></div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={!!editForm.laufzeit_in_14t} onCheckedChange={(v) => updateField('laufzeit_in_14t', v)} />
                  <label className="text-xs text-muted-foreground">Laufzeit in 14T</label>
                </div>
              </div>
            </section>

            {/* Notizen */}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notizen</h4>
              <Textarea rows={4} value={editForm.notes} onChange={e => updateField('notes', e.target.value)} />
            </section>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="deals">Deals ({deals.length + closeOpps.length})</TabsTrigger>
          <TabsTrigger value="onepage">Onepage-Leads ({onepageProjects.length})</TabsTrigger>
          <TabsTrigger value="showcase">Showcase ({totals.showcaseCount})</TabsTrigger>
          <TabsTrigger value="meta-ads">Meta Ads ({liveCampaigns.length})</TabsTrigger>
          <TabsTrigger value="aktivitaeten">Aktivitäten ({closeActs.length})</TabsTrigger>
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
        <TabsContent value="deals" className="mt-4 space-y-6">
          {/* Aus Close.com synct */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-primary" />
                  Aus Close.com synct
                  {closeLink?.last_synced_at && (
                    <span className="text-xs font-normal text-muted-foreground">
                      · letzter Sync: {fmtDate(closeLink.last_synced_at)}
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    onClick={() => setOppFilter('won')}
                    className={`px-2 py-1 rounded ${oppFilter === 'won' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >Won</button>
                  <button
                    onClick={() => setOppFilter('all')}
                    className={`px-2 py-1 rounded ${oppFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >Alle</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!closeLink ? (
                <p className="text-sm text-muted-foreground">Kein Close-Link vorhanden. Manuell verlinken in <Link to="/admin/close-sync" className="text-primary hover:underline">/admin/close-sync</Link>.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard label="Won-Deals" value={String(closeStats.wonCount)} />
                    <KpiCard label="Gesamt-Wert Won" value={fmtEur(closeStats.wonSum)} />
                    <KpiCard label="Letzter Won-Deal" value={fmtDate(closeStats.lastWon)} />
                    <KpiCard label="Offene Deals" value={String(closeStats.activeCount)} />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Status</TableHead><TableHead>Wert</TableHead><TableHead>Label</TableHead>
                        <TableHead>Datum</TableHead><TableHead>Closed by</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {filteredOpps.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Keine {oppFilter === 'won' ? 'Won-' : ''}Deals</TableCell></TableRow>
                        ) : filteredOpps.map((o: any) => (
                          <TableRow key={o.id}>
                            <TableCell>
                              <Badge variant={o.status_type === 'won' ? 'default' : o.status_type === 'lost' ? 'destructive' : 'secondary'}>
                                {o.status_type || '–'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium tabular-nums">
                              {o.value_formatted || (o.value_cents != null ? fmtEur(o.value_cents / 100) : '–')}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{o.status_label || '–'}</TableCell>
                            <TableCell className="text-muted-foreground">{fmtDate(o.date_won || o.date_created)}</TableCell>
                            <TableCell className="text-muted-foreground">{o.user_name || '–'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Bestehende close_deals (Notion) */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base text-muted-foreground">Notion-Deals (legacy)</CardTitle></CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto">
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
        <TabsContent value="showcase" className="mt-4 space-y-6">
          {websites.length === 0 && ads.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Showcase-Items</CardContent></Card>
          ) : (
            <>
              {/* WEBSITES */}
              {websites.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Websites ({websites.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {websites.map(w => (
                      <Link key={w.id} to={`/sales/referenz-showcase/websites/${w.id}`} className="block">
                        <Card className="hover:bg-muted/30 transition-colors overflow-hidden">
                          {w.thumbnail_url && (
                            <div className="aspect-video bg-muted overflow-hidden">
                              <img src={w.thumbnail_url} alt={w.title} className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          )}
                          <CardContent className="p-3">
                            <p className="text-sm font-medium truncate">{w.titel || w.url || w.id}</p>
                            <p className="text-xs text-muted-foreground truncate">{w.url || '–'}</p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* ANZEIGEN (referenz_meta_ads) */}
              {ads.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Anzeigen ({ads.length})</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {ads.slice(0, 12).map(ad => (
                      <Link key={ad.id} to={`/sales/referenz-showcase/werbeanzeigen/${ad.id}`} className="block">
                        <Card className="hover:bg-muted/30 transition-colors overflow-hidden">
                          {ad.thumbnail_url && (
                            <div className="aspect-square bg-muted overflow-hidden">
                              <img src={ad.thumbnail_url} alt={ad.meta_ad_name || ad.custom_title} className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          )}
                          <CardContent className="p-3">
                            <p className="text-sm font-medium truncate">{ad.custom_title || ad.meta_ad_name || 'Anzeige'}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {ad.meta_campaign_name || ad.meta_account_name || '–'}
                            </p>
                            {ad.is_top_performer && (
                              <span className="inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
                                TOP
                              </span>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                  {ads.length > 12 && (
                    <details className="group mt-3">
                      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground py-2 list-none flex items-center gap-1">
                        <ChevronDown className="h-4 w-4 group-open:rotate-180 transition-transform" />
                        Alle {ads.length - 12} weiteren Anzeigen anzeigen
                      </summary>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
                        {ads.slice(12).map(ad => (
                          <Link key={ad.id} to={`/sales/referenz-showcase/werbeanzeigen/${ad.id}`} className="block">
                            <Card className="hover:bg-muted/30 transition-colors overflow-hidden">
                              {ad.thumbnail_url && (
                                <div className="aspect-square bg-muted overflow-hidden">
                                  <img src={ad.thumbnail_url} alt={ad.meta_ad_name} className="w-full h-full object-cover" loading="lazy" />
                                </div>
                              )}
                              <CardContent className="p-3">
                                <p className="text-sm font-medium truncate">{ad.custom_title || ad.meta_ad_name}</p>
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* META ADS */}
        <TabsContent value="meta-ads" className="mt-4 space-y-4">
          {!client?.meta_account_id ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Meta Account ID hinterlegt. Bitte im Bearbeiten-Panel ergänzen.
              </CardContent>
            </Card>
          ) : liveLoading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lade Meta-Daten...
              </CardContent>
            </Card>
          ) : liveError ? (
            <Card>
              <CardContent className="py-6 space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <p className="font-medium text-sm">Fehler beim Laden von Meta-Daten</p>
                </div>
                <p className="text-xs text-muted-foreground break-words">{liveError}</p>
                <p className="text-xs text-muted-foreground">Account ID: {client.meta_account_id}</p>
              </CardContent>
            </Card>
          ) : liveCampaigns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Keine Kampagnen für diesen Account
              </CardContent>
            </Card>
          ) : (
            <>
              {(() => {
                const totals = liveCampaigns.reduce((acc, c: any) => {
                  const ins = c.insights?.data?.[0] || {};
                  acc.spend += Number(ins.spend || 0);
                  acc.impressions += Number(ins.impressions || 0);
                  acc.reach += Number(ins.reach || 0);
                  acc.clicks += Number(ins.clicks || 0);
                  return acc;
                }, { spend: 0, impressions: 0, reach: 0, clicks: 0 });
                const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card><CardContent className="p-3">
                      <p className="text-xs text-muted-foreground uppercase">Gesamt-Spend</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totals.spend)}
                      </p>
                    </CardContent></Card>
                    <Card><CardContent className="p-3">
                      <p className="text-xs text-muted-foreground uppercase">Impressions</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(totals.impressions)}
                      </p>
                    </CardContent></Card>
                    <Card><CardContent className="p-3">
                      <p className="text-xs text-muted-foreground uppercase">Reach</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(totals.reach)}
                      </p>
                    </CardContent></Card>
                    <Card><CardContent className="p-3">
                      <p className="text-xs text-muted-foreground uppercase">Clicks · CTR</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(totals.clicks)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">CTR {ctr.toFixed(2)}%</p>
                    </CardContent></Card>
                  </div>
                );
              })()}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Top 5 nach Spend</h3>
                  <Link to="/meta/kampagnen" className="text-xs text-primary hover:underline">
                    Alle {liveCampaigns.length} im Ads Manager →
                  </Link>
                </div>

                <div className="space-y-2">
                  {[...liveCampaigns]
                    .sort((a: any, b: any) => Number(b.insights?.data?.[0]?.spend || 0) - Number(a.insights?.data?.[0]?.spend || 0))
                    .slice(0, 5)
                    .map((c: any, idx: number) => {
                      const ins = c.insights?.data?.[0] || {};
                      const spend = Number(ins.spend || 0);
                      const impressions = Number(ins.impressions || 0);
                      const reach = Number(ins.reach || 0);
                      const clicks = Number(ins.clicks || 0);
                      const statusColor = c.status === 'ACTIVE' ? 'bg-green-500/15 text-green-500'
                                        : c.status === 'PAUSED' ? 'bg-yellow-500/15 text-yellow-500'
                                        : 'bg-muted text-muted-foreground';
                      return (
                        <Card key={c.id} className="hover:bg-muted/30 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="text-2xl font-bold text-muted-foreground/40 w-8 shrink-0">
                                #{idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{c.name}</p>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${statusColor}`}>
                                    {c.status}
                                  </span>
                                </div>
                                {c.objective && (
                                  <p className="text-xs text-muted-foreground truncate">{c.objective}</p>
                                )}
                              </div>
                              <div className="grid grid-cols-4 gap-4 text-right shrink-0">
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase">Spend</p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(spend)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase">Reach</p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(reach)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase">Impr.</p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(impressions)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase">Clicks</p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {new Intl.NumberFormat('de-DE', { notation: 'compact' }).format(clicks)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* PROJEKTE */}
        {/* AKTIVITÄTEN (Close.com) */}
        <TabsContent value="aktivitaeten" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-primary" />
                  Aktivitäten aus Close.com
                  {closeLink?.last_synced_at && (
                    <span className="text-xs font-normal text-muted-foreground">· {fmtDate(closeLink.last_synced_at)}</span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  {[
                    { k: 'all', l: 'Alle' },
                    { k: 'email', l: 'Emails' },
                    { k: 'call', l: 'Calls' },
                    { k: 'note', l: 'Notes' },
                    { k: 'meeting', l: 'Meetings' },
                    { k: 'sms', l: 'SMS' },
                  ].map(f => (
                    <button
                      key={f.k}
                      onClick={() => setActFilter(f.k)}
                      className={`px-2 py-1 rounded ${actFilter === f.k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    >{f.l}</button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!closeLink ? (
                <p className="text-sm text-muted-foreground">Kein Close-Link vorhanden.</p>
              ) : filteredActs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Aktivitäten synct — siehe Sync-Status.</p>
              ) : (
                <ul className="space-y-1">
                  {filteredActs.map((a: any) => (
                    <li key={a.id}>
                      <details className="group rounded border border-border/50 px-3 py-2 hover:bg-muted/30">
                        <summary className="flex items-center gap-3 cursor-pointer list-none">
                          <span className="text-muted-foreground shrink-0">{activityIcon(a.activity_type)}</span>
                          <span className="text-xs text-muted-foreground tabular-nums w-24 shrink-0">{fmtDate(a.date_created)}</span>
                          <span className="text-sm font-medium truncate flex-1">
                            {a.subject || a.activity_type || 'Aktivität'}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">{a.user_name || '–'}</span>
                        </summary>
                        {a.body_preview && (
                          <p className="mt-2 pl-7 text-xs text-muted-foreground whitespace-pre-wrap">{a.body_preview}</p>
                        )}
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROJEKTE */}
        <TabsContent value="projekte" className="mt-4 space-y-2">
          {projects.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Keine Projekte</CardContent></Card>
          ) : projects.map(p => (
            <Card
              key={p.id}
              onClick={() => setSelectedProject(p)}
              className="cursor-pointer hover:bg-muted/40 hover:border-primary/40 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{p.projektname || p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.typ || p.projekttyp || '–'} · {fmtDate(p.startdatum)}</p>
                  </div>
                  <Badge variant="secondary">{p.projektstatus || p.status}</Badge>
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
      {selectedProject && (
        <ProjekteSlidePanel
          project={selectedProject}
          onClose={() => { setSelectedProject(null); load(); }}
        />
      )}
    </div>
  );
}
