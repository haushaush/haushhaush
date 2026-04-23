import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { X, ExternalLink, AlertTriangle, Save, CalendarIcon, Trash2, FolderKanban, Facebook } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { KundeMetaAdsTab } from './KundeMetaAdsTab';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const AMPEL_MAP: Record<string, { dot: string; label: string }> = {
  'AA': { dot: 'bg-success', label: 'AA' }, 'A': { dot: 'bg-success', label: 'A' },
  'Grün': { dot: 'bg-success', label: 'Grün' },
  'BB': { dot: 'bg-warning', label: 'BB' }, 'B': { dot: 'bg-warning', label: 'B' },
  'Gelb': { dot: 'bg-warning', label: 'Gelb' },
  'CC': { dot: 'bg-destructive', label: 'CC' }, 'C': { dot: 'bg-destructive', label: 'C' },
  'Rot': { dot: 'bg-destructive', label: 'Rot' },
};

const FALLBACK_BG: Record<string, string> = {
  'Allianz': '#003781', 'Hanse Merkur': '#004B2D', 'HanseMerkur': '#004B2D',
  'AXA': '#00208C', 'Barmenia Gothaer': '#1a1a1a', 'Barmenia': '#1a1a1a',
  'Signal Iduna': '#E20028', 'Versicherungsmakler': '#0A3055', 'Individuell': '#374151',
};

const KUNDENSTATUS_OPTIONS = ['Offen', 'Onboarding', 'In Betreuung', 'Done', 'Follow Up'];
const AMPEL_OPTIONS = ['AA', 'A', 'BB', 'B', 'CC', 'C'];
const ZAHLSTATUS_OPTIONS = [
  'Offen', 'In Bearbeitung', 'Rechnung zu erstellen', 'Rechnung nicht versendet',
  'Rechnung versendet', 'Zahlung ausstehend', '3. Rate fällig', 'In Mahnung',
  'VC an HHS', 'HHS an VC', 'DONE',
];
const LAUFZEIT_OPTIONS = ['Unbegrenzt', 'Einmalig', '1 Monat', '2 Monate', '3 Monate', '4 Monate', '6 Monate', '7 Monate'];
const BRANCHE_OPTIONS = [
  'PKV', 'BU', 'Rechtsschutz', 'TKV', 'Unfallversicherung', 'Automotive', 'Handwerk',
  'Allfinanz', 'Immobilien', 'Versicherung', 'Solar', 'Zahnzusatz', 'Zahnersatz',
  'Haftpflicht', 'Wohngebäude', 'Altersvorsorge', 'Sterbegeld', 'Kindervorsorge',
  'Investment', 'Finanzen', 'Private Krankenversicherung', 'Beihilfe - PKV',
  'Tierkrankenversicherung', 'Recruiting', 'Dienstleister', 'Consulting', 'Restaurant',
  'Audio', 'Warehouse', 'Pflege', 'Umzugsunternehmen', 'Badrenovierung', 'Kunst',
  'KFZ', 'Textil', 'IT', 'Fahrrad', 'Brandschutzlösungen', 'Aviation', 'RS', 'Andere',
];
const PROJEKTTYP_OPTIONS = [
  'Meta Werbeanzeigen', 'Ads Landing Page', 'Performance Funnel', 'Onepage Website',
  'Branding Website', 'CRM', 'Videoshooting', 'Fotoshooting', 'Erklärvideo',
  'Social Media', 'SEO', 'Google Werbeanzeigen', 'Design', 'Printdesign',
  'Vorqualifikation', 'Leads kaufen', 'Leadkauf', 'Superchat', 'Ai Mail Automation',
  'Ads Betreuung & Optimierung', 'Conversion-optimierte Landing Page',
  'CRM Setup & Anbindung', 'Mehrstufiger Funnel', 'Meta Werbebudget',
  'Google Unternehmensprofil', 'Development', 'Tech Support', 'Freebie erstellen', 'Sonstiges',
];
const UNTERNEHMEN_OPTIONS = [
  'Allianz', 'Hanse Merkur', 'AXA', 'Barmenia Gothaer', 'Versicherungsmakler',
  'Signal Iduna', 'Individuell', 'ARAG', 'ERGO', 'Real Estates Dubai', 'Nexus 2',
  'Lackdoktor Ralf Reller', 'Leadsharks', 'Deutsches Marklerforum AG',
  'Private PKV Consulting', 'PraeLux Gesellschaft für Investmentberatung mbH', 'EWE',
  'Reller Automobile GmbH', 'Von Buddenbrock Concepts GmbH', 'Senne handels Gbr',
  'SolarMolar', 'Mocho Versicherungsmakler', 'Tecplus GmbH', 'Thie GmbH',
  'Falkenreck & Hallau-Grüner OHG', 'Udo Brass e.K.', 'Wonka.Audio',
  'Zaunkreisel GmbH', 'Skyhub PAD',
];

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

interface KundenSlidePanelProps { deal: any; onClose: () => void; onDelete?: (id: string) => void; }

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      {children}
    </div>
  );
}

function FinRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/* Searchable single select */
function SearchableSingleSelect({ value, options, onChange, placeholder = 'Suchen…' }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <div className="min-h-[34px] border border-input rounded-md px-2 py-1 flex flex-wrap gap-1 items-center cursor-text bg-background" onClick={() => setOpen(true)}>
        {value && (
          <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-[4px] flex items-center gap-1">
            {value}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setSearch(''); }} className="hover:text-destructive font-medium">×</button>
          </span>
        )}
        <input value={search} onChange={e => { setSearch(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={value ? 'Suchen…' : placeholder}
          className="outline-none text-sm flex-1 min-w-[80px] bg-transparent text-foreground placeholder:text-muted-foreground" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[200] w-full bg-background border border-input rounded-md shadow-lg mt-1 max-h-[200px] overflow-y-auto">
          {filtered.map(o => (
            <div key={o} onClick={() => { onChange(o); setSearch(''); setOpen(false); }}
              className={cn("px-3 py-1.5 text-sm hover:bg-muted cursor-pointer transition-colors", value === o && "bg-primary/10 text-primary font-medium")}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Searchable multi-select */
function SearchableMultiSelect({ value, options, onChange, placeholder = 'Suchen…' }: {
  value: string[]; options: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()) && !value.includes(o));

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <div className="min-h-[34px] border border-input rounded-md px-2 py-1 flex flex-wrap gap-1 cursor-text bg-background" onClick={() => setOpen(true)}>
        {value.map(v => (
          <span key={v} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-[4px] flex items-center gap-1">
            {v}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(value.filter(x => x !== v)); }} className="hover:text-destructive font-medium">×</button>
          </span>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setOpen(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="outline-none text-sm flex-1 min-w-[100px] bg-transparent text-foreground placeholder:text-muted-foreground" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[200] w-full bg-background border border-input rounded-md shadow-lg mt-1 max-h-[200px] overflow-y-auto">
          {filtered.map(o => (
            <div key={o} onClick={() => { onChange([...value, o]); setSearch(''); }}
              className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer transition-colors">{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Date picker field using Shadcn Calendar */
function DatePickerField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const dateObj = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className={cn(
            "flex items-center gap-2 w-full h-[34px] border border-input rounded-md px-2 text-sm bg-background text-left",
            !dateObj && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {dateObj ? format(dateObj, 'dd.MM.yyyy', { locale: de }) : 'Datum wählen…'}
          {dateObj && (
            <button
              type="button"
              className="ml-auto hover:text-destructive"
              onClick={e => { e.stopPropagation(); onChange(null); }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[300]" align="start" onClick={e => e.stopPropagation()}>
        <Calendar
          mode="single"
          selected={dateObj}
          onSelect={d => onChange(d ? format(d, 'yyyy-MM-dd') : null)}
          locale={de}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

const PROJECT_STATUS_STYLES: Record<string, string> = {
  'Noch nicht gestartet': 'bg-destructive/20 text-destructive',
  'Onboarding / Planung': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'In Bearbeitung': 'bg-warning/20 text-warning',
  'Internes Review': 'bg-muted text-muted-foreground',
  'Client Review': 'bg-muted text-muted-foreground',
  'Laufzeitbetreuung': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Abgeschlossen': 'bg-success/20 text-success',
  'Pausiert': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

export default function KundenSlidePanel({ deal: d, onClose, onDelete }: KundenSlidePanelProps) {
  const navigate = useNavigate();
  const [companyLogo, setCompanyLogo] = useState<{ logo_url: string | null; bg_color: string | null } | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkedProjects, setLinkedProjects] = useState<any[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('uebersicht');
  const [metaMatches, setMetaMatches] = useState<any[]>([]);

  const reloadMetaMatches = useCallback(() => {
    if (!d?.id) return;
    supabase.from('kunde_meta_accounts').select('*').eq('kunde_id', d.id)
      .then(({ data }) => setMetaMatches(data || []));
  }, [d?.id]);

  useEffect(() => { reloadMetaMatches(); }, [reloadMetaMatches]);

  // Auto-switch to Meta Ads tab when ?tab=meta-ads is in URL on open
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === 'meta-ads' && metaMatches.length > 0) {
      setActiveTab('meta-ads');
      url.searchParams.delete('tab');
      window.history.replaceState({}, '', url.toString());
    }
  }, [metaMatches.length]);

  const deal = d;

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('close_deals').delete().eq('id', d.id);
    if (error) {
      toast.error('Fehler beim Löschen', { description: error.message });
      setDeleting(false);
      return;
    }
    toast.success('Kunde wurde gelöscht');
    setDeleteConfirmOpen(false);
    onClose();
    onDelete?.(d.id);
  };
  const [saving, setSaving] = useState(false);

  // Initialize editData from deal on mount
  useEffect(() => {
    setEditData({
      vor_nachname: d.vor_nachname ?? '',
      email: d.email ?? '',
      telefon: d.telefon ?? '',
      website_url: d.website_url ?? '',
      unternehmen: d.unternehmen ?? '',
      branche: d.branche ?? [],
      projekttyp: d.projekttyp ?? [],
      laufzeit: d.laufzeit ?? '',
      start_datum: d.start_datum ?? null,
      end_datum: d.end_datum ?? null,
      deadline: d.deadline ?? null,
      laufzeit_in_14t: d.laufzeit_in_14t ?? false,
      kundenstatus: d.kundenstatus ?? '',
      ampel: d.ampel ?? d.ampelstatus ?? '',
      zahlstatus: d.zahlstatus ?? '',
      gesamt_saldo: d.gesamt_saldo ?? d.wert_eur ?? null,
      ads_budget: d.ads_budget ?? null,
      cash_collect_offen: d.cash_collect_offen ?? null,
      clv: d.clv ?? null,
      meta_kosten: d.meta_kosten ?? null,
      crm_kosten: d.crm_kosten ?? null,
      superchat_kosten: d.superchat_kosten ?? null,
      website_kosten: d.website_kosten ?? null,
    });
  }, [d]);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleEsc); document.body.style.overflow = ''; };
  }, [handleEsc]);

  useEffect(() => {
    const company = d.unternehmen;
    if (!company) return;
    supabase.from('company_logos').select('logo_url, bg_color').eq('unternehmen', company).maybeSingle()
      .then(({ data }) => { if (data) setCompanyLogo(data as any); });
  }, [d.unternehmen]);

  // Fetch linked projects
  useEffect(() => {
    if (!d.notion_id) { setLinkedProjects([]); return; }
    setProjectsLoading(true);
    supabase.from('projects').select('*').contains('verknuepfte_kunden_ids', [d.notion_id])
      .then(({ data }) => { setLinkedProjects(data || []); setProjectsLoading(false); });
  }, [d.notion_id]);

  const fmtProjDate = (v: string | null | undefined) => {
    if (!v) return null;
    try { return new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return v; }
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...editData };
    ['start_datum', 'end_datum', 'deadline'].forEach(f => { if (payload[f] === '') payload[f] = null; });
    const { error } = await supabase.from('close_deals').update(payload as any).eq('id', d.id);
    setSaving(false);
    if (error) { toast.error('Fehler beim Speichern'); console.error(error); }
    else { Object.assign(d, payload); toast.success('Gespeichert'); }
  };

  const upd = (field: string, value: any) => setEditData(p => ({ ...p, [field]: value }));

  const ks = editData.kundenstatus || '–';
  const ampelRaw = editData.ampel || '';
  const ampel = AMPEL_MAP[ampelRaw] || { dot: 'bg-muted', label: ampelRaw || '–' };
  const company = d.unternehmen || '';
  const bgColor = companyLogo?.bg_color || FALLBACK_BG[company] || '#374151';
  const logoUrl = companyLogo?.logo_url;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />

      <div className="relative z-[60] w-full sm:w-[50vw] sm:min-w-[420px] bg-background shadow-2xl animate-slide-in-right flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-20">
          {/* Header */}
          <div className="relative h-[140px] overflow-hidden" style={{ background: bgColor }}>
            {logoUrl && <img src={logoUrl} alt={company} className="absolute inset-0 w-full h-full object-cover object-center" />}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%)' }} />
            <div className="relative h-full flex flex-col justify-between px-6 pt-4 pb-4">
              <div className="flex items-start justify-between">
                <span className="text-white/70 text-xs font-medium tracking-wide uppercase">{company || 'Unbekannt'}</span>
                <div className="flex gap-2">
                  {d.notion_url && (
                    <a href={d.notion_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10 h-8">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Notion
                      </Button>
                    </a>
                  )}
                  <button onClick={onClose} className="text-white/80 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div>
                <h2 className="text-xl font-heading font-bold text-white">{d.client_name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className={`text-xs rounded-[4px] ${STATUS_STYLES[ks] || 'bg-white/20 text-white'}`}>{ks}</Badge>
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${ampel.dot}`} />
                    <span className="text-xs font-medium text-white/80">{ampel.label}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-4 pb-0">
              <TabsList className="w-full">
                <TabsTrigger value="uebersicht" className="flex-1">Übersicht</TabsTrigger>
                <TabsTrigger value="projekte" className="flex-1">
                  Projekte{!projectsLoading && linkedProjects.length > 0 ? ` (${linkedProjects.length})` : ''}
                </TabsTrigger>
                {metaMatches.length > 0 && (
                  <TabsTrigger value="meta-ads" className="flex-1 gap-1.5">
                    <Facebook className="h-3.5 w-3.5" />
                    Meta Ads{metaMatches.length > 1 ? ` (${metaMatches.length})` : ''}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="uebersicht" className="flex-1 m-0 overflow-y-auto">
              <div className="p-6 space-y-6">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Kontakt & Info</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <FieldRow label="Vor- & Nachname">
                      <Input className="h-[34px] text-sm" value={editData.vor_nachname ?? ''} onChange={e => upd('vor_nachname', e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Email">
                      <Input className="h-[34px] text-sm" value={editData.email ?? ''} onChange={e => upd('email', e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Telefon">
                      <Input className="h-[34px] text-sm" value={editData.telefon ?? ''} onChange={e => upd('telefon', e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Website URL">
                      <Input className="h-[34px] text-sm" value={editData.website_url ?? ''} onChange={e => upd('website_url', e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Unternehmen">
                      <SearchableSingleSelect value={editData.unternehmen ?? ''} options={UNTERNEHMEN_OPTIONS} onChange={v => upd('unternehmen', v)} />
                    </FieldRow>
                    <FieldRow label="Branche">
                      <SearchableMultiSelect value={editData.branche ?? []} options={BRANCHE_OPTIONS} onChange={v => upd('branche', v)} placeholder="Branche suchen…" />
                    </FieldRow>
                    <div className="col-span-2">
                      <FieldRow label="Projekttyp">
                        <SearchableMultiSelect value={editData.projekttyp ?? []} options={PROJEKTTYP_OPTIONS} onChange={v => upd('projekttyp', v)} placeholder="Projekttyp suchen…" />
                      </FieldRow>
                    </div>
                    <FieldRow label="Laufzeit">
                      <SearchableSingleSelect value={editData.laufzeit ?? ''} options={LAUFZEIT_OPTIONS} onChange={v => upd('laufzeit', v)} />
                    </FieldRow>
                    <FieldRow label="Startdatum">
                      <DatePickerField value={editData.start_datum} onChange={v => upd('start_datum', v)} />
                    </FieldRow>
                    <FieldRow label="Enddatum">
                      <DatePickerField value={editData.end_datum} onChange={v => upd('end_datum', v)} />
                    </FieldRow>
                    <FieldRow label="Deadline">
                      <DatePickerField value={editData.deadline} onChange={v => upd('deadline', v)} />
                    </FieldRow>
                    <FieldRow label="Laufzeit in 14T fällig">
                      <label className="flex items-center gap-2 cursor-pointer h-[34px]">
                        <input type="checkbox" checked={editData.laufzeit_in_14t ?? false} onChange={e => upd('laufzeit_in_14t', e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-primary" />
                        <span className="text-sm">{editData.laufzeit_in_14t ? 'Ja' : 'Nein'}</span>
                      </label>
                    </FieldRow>
                    <FieldRow label="Kundenstatus">
                      <SearchableSingleSelect value={editData.kundenstatus ?? ''} options={KUNDENSTATUS_OPTIONS} onChange={v => upd('kundenstatus', v)} />
                    </FieldRow>
                    <FieldRow label="Ampelstatus">
                      <SearchableSingleSelect value={editData.ampel ?? ''} options={AMPEL_OPTIONS} onChange={v => upd('ampel', v)} />
                    </FieldRow>
                    <FieldRow label="Zahlstatus">
                      <SearchableSingleSelect value={editData.zahlstatus ?? ''} options={ZAHLSTATUS_OPTIONS} onChange={v => upd('zahlstatus', v)} />
                    </FieldRow>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Finanzen</h3>
                  <div className="bg-muted/30 rounded-lg p-4">
                    {([
                      ['Gesamt-Saldo', 'gesamt_saldo'],
                      ['Ads-Budget', 'ads_budget'],
                      ['Cash Collect offen', 'cash_collect_offen'],
                      ['CLV', 'clv'],
                      ['Meta Kosten', 'meta_kosten'],
                      ['CRM Kosten', 'crm_kosten'],
                      ['Superchat Kosten', 'superchat_kosten'],
                      ['Website Kosten', 'website_kosten'],
                    ] as [string, string][]).map(([label, field]) => (
                      <FinRow key={field} label={label}>
                        <Input type="number" className="h-[34px] text-sm text-right tabular-nums w-32"
                          value={editData[field] ?? ''} onChange={e => upd(field, e.target.value === '' ? null : Number(e.target.value))} />
                      </FinRow>
                    ))}
                  </div>
                </section>

                {editData.laufzeit_in_14t && (
                  <div className="flex items-center gap-2 bg-warning/10 text-warning rounded-md px-3 py-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm font-medium">Laufzeit in 14 Tagen fällig</span>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="projekte" className="flex-1 m-0 overflow-y-auto">
              <div className="p-6">
                {projectsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />)}
                  </div>
                ) : linkedProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <FolderKanban className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">Keine Projekte verknüpft</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {linkedProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { onClose(); navigate(`/projekte?projekt=${p.id}`); }}
                        className="w-full text-left border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{p.projektname || p.name || '–'}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              {p.projektstatus && (
                                <Badge variant="secondary" className={`text-[10px] rounded-[4px] ${PROJECT_STATUS_STYLES[p.projektstatus] || 'bg-muted text-muted-foreground'}`}>
                                  {p.projektstatus}
                                </Badge>
                              )}
                              {p.zahlstatus && (
                                <Badge variant="outline" className="text-[10px] rounded-[4px]">{p.zahlstatus}</Badge>
                              )}
                            </div>
                          </div>
                          {p.cash_collect != null && (
                            <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-foreground">{fmt(p.cash_collect)}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(p.typ || []).map((t: string) => (
                            <span key={t} className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-[3px]">{t}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {p.laufzeit && <span>{p.laufzeit}</span>}
                          {(p.startdatum || p.enddatum) && (
                            <span>{fmtProjDate(p.startdatum)} → {fmtProjDate(p.enddatum) || '–'}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sticky save footer */}
        <div className="sticky bottom-0 border-t border-border bg-background px-6 py-3 flex items-center justify-between">
          {onDelete ? (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1.5" />Löschen
            </Button>
          ) : <div />}
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px]">
            <Save className="h-4 w-4 mr-2" />{saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>

        {/* Delete confirmation dialog */}
        {deleteConfirmOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirmOpen(false)}>
            <div className="bg-background rounded-xl border border-border shadow-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold mb-2">Kunde löschen</h3>
              <p className="text-sm text-muted-foreground mb-5">
                Möchtest du <strong>{deal.client_name}</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)}>Abbrechen</Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Löscht…' : 'Löschen'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
