import { useEffect, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { X, ExternalLink, AlertTriangle, Save, CalendarIcon, Check, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

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
  'Investment', 'Finanzen', 'Andere',
];
const PROJEKTTYP_OPTIONS = [
  'Meta Werbeanzeigen', 'Ads Landing Page', 'Performance Funnel', 'Onepage Website',
  'Branding Website', 'CRM', 'Videoshooting', 'Fotoshooting', 'Erklärvideo',
  'Social Media', 'SEO', 'Google Werbeanzeigen', 'Design', 'Printdesign', 'Sonstiges',
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

/* Multi-select for edit mode */
function MultiSelectField({ value, options, onChange }: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (item: string) => {
    onChange(value.includes(item) ? value.filter(x => x !== item) : [...value, item]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex flex-wrap gap-1 cursor-pointer min-h-[28px] items-center border border-input rounded-md px-2 py-1">
          {value.length > 0 ? value.map(b => (
            <Badge key={b} variant="secondary" className="text-[10px] rounded-[4px]">{b}</Badge>
          )) : <span className="text-sm text-muted-foreground">Auswählen…</span>}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-60 max-h-64 overflow-y-auto p-2" align="start">
        {options.map(o => (
          <button
            key={o}
            type="button"
            className={cn(
              "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted/60 transition-colors",
              value.includes(o) && "bg-muted"
            )}
            onClick={() => toggle(o)}
          >
            <span className={cn("h-4 w-4 rounded border flex items-center justify-center", value.includes(o) ? "bg-primary border-primary" : "border-border")}>
              {value.includes(o) && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
            {o}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* Date picker for edit mode */
function DateField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const dateObj = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1.5 text-sm border border-input rounded-md px-2 h-8 w-full">
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          {dateObj ? format(dateObj, 'dd.MM.yyyy', { locale: de }) : <span className="text-muted-foreground">–</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateObj}
          onSelect={d => onChange(d ? format(d, 'yyyy-MM-dd') : null)}
          className="p-3 pointer-events-auto"
          locale={de}
        />
      </PopoverContent>
    </Popover>
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
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({});
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('close_deals').update(editData as any).eq('id', d.id);
    setSaving(false);
    if (error) {
      toast.error('Fehler beim Speichern');
      console.error(error);
    } else {
      Object.assign(d, editData);
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

  const val = (field: string) => isEditing ? editData[field] : d[field];

  return (
    <div className="fixed inset-0 z-[400] flex justify-end">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />

      <div className="relative w-full sm:w-[50vw] sm:min-w-[420px] bg-background shadow-2xl animate-slide-in-right overflow-y-auto">
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
                  <a href={d.notion_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
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
                  <Input className="h-7 text-sm" value={editData.vor_nachname} onChange={e => upd('vor_nachname', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.vor_nachname || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Email">
                {isEditing ? (
                  <Input className="h-7 text-sm" value={editData.email} onChange={e => upd('email', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.email || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Telefon">
                {isEditing ? (
                  <Input className="h-7 text-sm" value={editData.telefon} onChange={e => upd('telefon', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.telefon || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Website URL">
                {isEditing ? (
                  <Input className="h-7 text-sm" value={editData.website_url} onChange={e => upd('website_url', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.website_url || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Unternehmen">
                {isEditing ? (
                  <Input className="h-7 text-sm" value={editData.unternehmen} onChange={e => upd('unternehmen', e.target.value)} />
                ) : (
                  <span className="text-sm">{d.unternehmen || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Branche">
                {isEditing ? (
                  <MultiSelectField value={editData.branche || []} options={BRANCHE_OPTIONS} onChange={v => upd('branche', v)} />
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
                    <MultiSelectField value={editData.projekttyp || []} options={PROJEKTTYP_OPTIONS} onChange={v => upd('projekttyp', v)} />
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
                  <Select value={editData.laufzeit} onValueChange={v => upd('laufzeit', v)}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="–" /></SelectTrigger>
                    <SelectContent>{LAUFZEIT_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm">{d.laufzeit || '–'}</span>
                )}
              </FieldRow>
              <FieldRow label="Startdatum">
                {isEditing ? (
                  <DateField value={editData.start_datum} onChange={v => upd('start_datum', v)} />
                ) : (
                  <span className="text-sm">{fmtDate(d.start_datum)}</span>
                )}
              </FieldRow>
              <FieldRow label="Enddatum">
                {isEditing ? (
                  <DateField value={editData.end_datum} onChange={v => upd('end_datum', v)} />
                ) : (
                  <span className="text-sm">{fmtDate(d.end_datum)}</span>
                )}
              </FieldRow>
              <FieldRow label="Deadline">
                {isEditing ? (
                  <DateField value={editData.deadline} onChange={v => upd('deadline', v)} />
                ) : (
                  <span className="text-sm">{fmtDate(d.deadline)}</span>
                )}
              </FieldRow>
              <FieldRow label="Laufzeit in 14T fällig">
                {isEditing ? (
                  <button
                    type="button"
                    className={cn("h-5 w-5 rounded border flex items-center justify-center transition-colors", editData.laufzeit_in_14t ? "bg-primary border-primary" : "border-border")}
                    onClick={() => upd('laufzeit_in_14t', !editData.laufzeit_in_14t)}
                  >
                    {editData.laufzeit_in_14t && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                  </button>
                ) : (
                  <span className="text-sm">{d.laufzeit_in_14t ? 'Ja' : 'Nein'}</span>
                )}
              </FieldRow>
              <FieldRow label="Kundenstatus">
                {isEditing ? (
                  <Select value={editData.kundenstatus} onValueChange={v => upd('kundenstatus', v)}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="–" /></SelectTrigger>
                    <SelectContent>{KUNDENSTATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className={`text-xs rounded-[4px] w-fit ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>{ks}</Badge>
                )}
              </FieldRow>
              <FieldRow label="Ampelstatus">
                {isEditing ? (
                  <Select value={editData.ampel} onValueChange={v => upd('ampel', v)}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="–" /></SelectTrigger>
                    <SelectContent>{AMPEL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${ampel.dot}`} />
                    <span className="text-sm font-medium">{ampel.label}</span>
                  </span>
                )}
              </FieldRow>
              <FieldRow label="Zahlstatus">
                {isEditing ? (
                  <Select value={editData.zahlstatus} onValueChange={v => upd('zahlstatus', v)}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="–" /></SelectTrigger>
                    <SelectContent>{ZAHLSTATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
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
                      className="h-7 text-sm text-right tabular-nums w-32"
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
