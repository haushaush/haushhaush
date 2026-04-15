import { useEffect, useCallback, useState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ExternalLink, AlertTriangle, Save, Check, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const AMPEL_MAP: Record<string, { dot: string; label: string }> = {
  'AA': { dot: 'bg-success', label: 'AA' },
  'A': { dot: 'bg-success', label: 'A' },
  'Grün': { dot: 'bg-success', label: 'Grün' },
  'BB': { dot: 'bg-warning', label: 'BB' },
  'B': { dot: 'bg-warning', label: 'B' },
  'Gelb': { dot: 'bg-warning', label: 'Gelb' },
  'CC': { dot: 'bg-destructive', label: 'CC' },
  'C': { dot: 'bg-destructive', label: 'C' },
  'Rot': { dot: 'bg-destructive', label: 'Rot' },
};

const FALLBACK_BG: Record<string, string> = {
  'Allianz': '#003781',
  'Hanse Merkur': '#004B2D',
  'HanseMerkur': '#004B2D',
  'AXA': '#00208C',
  'Barmenia Gothaer': '#1a1a1a',
  'Barmenia': '#1a1a1a',
  'Signal Iduna': '#E20028',
  'Versicherungsmakler': '#0A3055',
  'Individuell': '#374151',
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
  'Google Unternehmensprofil', 'Development', 'Tech Support', 'Freebie erstellen',
  'Sonstiges',
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

const fmtDate = (d: string | null) => {
  if (!d) return '–';
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
};

interface KundenSlidePanelProps {
  deal: any;
  onClose: () => void;
}

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

/* Native single select */
function NativeSelect({ value, options, onChange, placeholder = '-- Auswählen --' }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background text-foreground h-8"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* Searchable multi-select */
function SearchableMultiSelect({ value, options, onChange, placeholder = 'Suchen…' }: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase()) && !value.includes(o)
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <div
        className="min-h-[38px] border border-input rounded-md px-2 py-1 flex flex-wrap gap-1 cursor-text bg-background"
        onClick={() => setOpen(true)}
      >
        {value.map(v => (
          <span key={v} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-[4px] flex items-center gap-1">
            {v}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(value.filter(x => x !== v)); }}
              className="hover:text-destructive font-medium"
            >×</button>
          </span>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="outline-none text-sm flex-1 min-w-[100px] bg-transparent text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[200] w-full bg-background border border-input rounded-md shadow-lg mt-1 max-h-[200px] overflow-y-auto">
          {filtered.map(o => (
            <div
              key={o}
              onClick={() => { onChange([...value, o]); setSearch(''); }}
              className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer transition-colors"
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default function KundenSlidePanel({ deal: d, onClose }: KundenSlidePanelProps) {
  const [companyLogo, setCompanyLogo] = useState<{ logo_url: string | null; bg_color: string | null } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isEditing) { setIsEditing(false); setEditData({}); }
      else onClose();
    }
  }, [onClose, isEditing]);

  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [handleEsc]);

  useEffect(() => {
    const company = d.unternehmen;
    if (!company) return;
    supabase.from('company_logos').select('logo_url, bg_color').eq('unternehmen', company).maybeSingle()
      .then(({ data }) => { if (data) setCompanyLogo(data as any); });
  }, [d.unternehmen]);

  const startEditing = () => {
    setEditData({
      vor_nachname: d.vor_nachname ?? '',
      email: d.email ?? '',
      telefon: d.telefon ?? '',
      website_url: d.website_url ?? '',
      unternehmen: d.unternehmen ?? '',
      branche: d.branche ?? [],
      projekttyp: d.projekttyp ?? [],
      laufzeit: d.laufzeit ?? '',
      start_datum: d.start_datum ?? '',
      end_datum: d.end_datum ?? '',
      deadline: d.deadline ?? '',
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
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...editData };
    // Convert empty date strings to null
    ['start_datum', 'end_datum', 'deadline'].forEach(f => {
      if (payload[f] === '') payload[f] = null;
    });
    const { error } = await supabase.from('close_deals').update(payload as any).eq('id', d.id);
    setSaving(false);
    if (error) {
      toast.error('Fehler beim Speichern');
      console.error(error);
    } else {
      Object.assign(d, payload);
      setIsEditing(false);
      setEditData({});
      toast.success('Gespeichert');
    }
  };

  const upd = (field: string, value: any) => setEditData(p => ({ ...p, [field]: value }));

  const ks = isEditing ? (editData.kundenstatus || '–') : (d.kundenstatus || '–');
  const ampelRaw = isEditing ? (editData.ampel || '') : (d.ampel || d.ampelstatus || '');
  const ampel = AMPEL_MAP[ampelRaw] || { dot: 'bg-muted', label: ampelRaw || '–' };
  const company = d.unternehmen || '';
  const bgColor = companyLogo?.bg_color || FALLBACK_BG[company] || '#374151';
  const logoUrl = companyLogo?.logo_url;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />

      <div
        className="relative z-[60] w-full sm:w-[50vw] sm:min-w-[420px] bg-background shadow-2xl animate-slide-in-right overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative h-[140px] overflow-hidden" style={{ background: bgColor }}>
          {logoUrl && (
            <img src={logoUrl} alt={company} className="absolute inset-0 w-full h-full object-cover object-center" />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%)' }} />
          <div className="relative h-full flex flex-col justify-between px-6 pt-4 pb-4">
            <div className="flex items-start justify-between">
              <span className="text-white/70 text-xs font-medium tracking-wide uppercase">{company || 'Unbekannt'}</span>
              <div className="flex gap-2">
                {!isEditing && (
                  <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10 h-8" onClick={startEditing}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Bearbeiten
                  </Button>
                )}
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

        {/* Edit action bar */}
        {isEditing && (
          <div className="sticky top-0 z-10 bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-between">
            <span className="text-sm text-primary font-medium">Bearbeitungsmodus</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>Abbrechen</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? 'Speichert…' : 'Speichern'}
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* KONTAKT & INFO */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Kontakt & Info</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FieldRow label="Vor- & Nachname">
                {isEditing ? (
                  <Input className="h-8 text-sm" value={editData.vor_nachname} onChange={e => upd('vor_nachname', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.vor_nachname || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Email">
                {isEditing ? (
                  <Input className="h-8 text-sm" value={editData.email} onChange={e => upd('email', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.email || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Telefon">
                {isEditing ? (
                  <Input className="h-8 text-sm" value={editData.telefon} onChange={e => upd('telefon', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.telefon || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Website URL">
                {isEditing ? (
                  <Input className="h-8 text-sm" value={editData.website_url} onChange={e => upd('website_url', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.website_url || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Unternehmen">
                {isEditing ? (
                  <NativeSelect value={editData.unternehmen} options={UNTERNEHMEN_OPTIONS} onChange={v => upd('unternehmen', v)} />
                ) : (
                  <span className="text-sm">{d.unternehmen || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Branche">
                {isEditing ? (
                  <CheckboxMultiSelect value={editData.branche || []} options={BRANCHE_OPTIONS} onChange={v => upd('branche', v)} />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(d.branche || []).length > 0 ? (d.branche as string[]).map((b: string) => (
                      <Badge key={b} variant="secondary" className="text-[10px] rounded-[4px]">{b}</Badge>
                    )) : <span className="text-sm text-muted-foreground">–</span>}
                  </div>
                )}
              </FieldRow>
              <div className="col-span-2">
                <FieldRow label="Projekttyp">
                  {isEditing ? (
                    <CheckboxMultiSelect value={editData.projekttyp || []} options={PROJEKTTYP_OPTIONS} onChange={v => upd('projekttyp', v)} />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(d.projekttyp || []).length > 0 ? (d.projekttyp as string[]).map((b: string) => (
                        <Badge key={b} variant="secondary" className="text-[10px] rounded-[4px]">{b}</Badge>
                      )) : <span className="text-sm text-muted-foreground">–</span>}
                    </div>
                  )}
                </FieldRow>
              </div>
              <FieldRow label="Laufzeit">
                {isEditing ? (
                  <NativeSelect value={editData.laufzeit} options={LAUFZEIT_OPTIONS} onChange={v => upd('laufzeit', v)} />
                ) : (
                  <span className="text-sm">{d.laufzeit || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Startdatum">
                {isEditing ? (
                  <Input type="date" className="h-8 text-sm" value={editData.start_datum || ''} onChange={e => upd('start_datum', e.target.value)} />
                ) : (
                  <span className="text-sm">{fmtDate(d.start_datum)}</span>
                )}
              </FieldRow>
              <FieldRow label="Enddatum">
                {isEditing ? (
                  <Input type="date" className="h-8 text-sm" value={editData.end_datum || ''} onChange={e => upd('end_datum', e.target.value)} />
                ) : (
                  <span className="text-sm">{fmtDate(d.end_datum)}</span>
                )}
              </FieldRow>
              <FieldRow label="Deadline">
                {isEditing ? (
                  <Input type="date" className="h-8 text-sm" value={editData.deadline || ''} onChange={e => upd('deadline', e.target.value)} />
                ) : (
                  <span className="text-sm">{fmtDate(d.deadline)}</span>
                )}
              </FieldRow>
              <FieldRow label="Laufzeit in 14T fällig">
                {isEditing ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editData.laufzeit_in_14t}
                      onChange={e => upd('laufzeit_in_14t', e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm">{editData.laufzeit_in_14t ? 'Ja' : 'Nein'}</span>
                  </label>
                ) : (
                  <span className="text-sm">{d.laufzeit_in_14t ? 'Ja' : 'Nein'}</span>
                )}
              </FieldRow>
              <FieldRow label="Kundenstatus">
                {isEditing ? (
                  <NativeSelect value={editData.kundenstatus} options={KUNDENSTATUS_OPTIONS} onChange={v => upd('kundenstatus', v)} />
                ) : (
                  <Badge variant="secondary" className={`text-xs rounded-[4px] w-fit ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>{ks}</Badge>
                )}
              </FieldRow>
              <FieldRow label="Ampelstatus">
                {isEditing ? (
                  <NativeSelect value={editData.ampel} options={AMPEL_OPTIONS} onChange={v => upd('ampel', v)} />
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${ampel.dot}`} />
                    <span className="text-sm font-medium">{ampel.label}</span>
                  </span>
                )}
              </FieldRow>
              <FieldRow label="Zahlstatus">
                {isEditing ? (
                  <NativeSelect value={editData.zahlstatus} options={ZAHLSTATUS_OPTIONS} onChange={v => upd('zahlstatus', v)} />
                ) : (
                  <span className="text-sm">{d.zahlstatus || '–'}</span>
                )}
              </FieldRow>
            </div>
          </section>

          {/* FINANZEN */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Finanzen</h3>
            <div className="bg-muted/30 rounded-lg p-4">
              {([
                ['Gesamt-Saldo', 'gesamt_saldo', d.gesamt_saldo ?? d.wert_eur],
                ['Ads-Budget', 'ads_budget', d.ads_budget],
                ['Cash Collect offen', 'cash_collect_offen', d.cash_collect_offen],
                ['CLV', 'clv', d.clv],
                ['Meta Kosten', 'meta_kosten', d.meta_kosten],
                ['CRM Kosten', 'crm_kosten', d.crm_kosten],
                ['Superchat Kosten', 'superchat_kosten', d.superchat_kosten],
                ['Website Kosten', 'website_kosten', d.website_kosten],
              ] as [string, string, number | null][]).map(([label, field, fallback]) => (
                <FinRow key={field} label={label}>
                  {isEditing ? (
                    <Input
                      type="number"
                      className="h-8 text-sm text-right tabular-nums w-32"
                      value={editData[field] ?? ''}
                      onChange={e => upd(field, e.target.value === '' ? null : Number(e.target.value))}
                    />
                  ) : (
                    <span className="text-sm font-medium tabular-nums">{fmt(fallback)}</span>
                  )}
                </FinRow>
              ))}
            </div>
          </section>

          {/* Status alerts */}
          {(d.laufzeit_in_14t || (isEditing && editData.laufzeit_in_14t)) && (
            <div className="flex items-center gap-2 bg-warning/10 text-warning rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">Laufzeit in 14 Tagen fällig</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
