import { useEffect, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { X, ExternalLink, AlertTriangle, Save, CalendarIcon, Check } from 'lucide-react';
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

/* ---------- Editable field components ---------- */

function EditableText({ value, field, editData, setEditData }: {
  value: string | null; field: string; editData: Record<string, any>; setEditData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const [editing, setEditing] = useState(false);
  const current = field in editData ? editData[field] : (value ?? '');
  if (editing) {
    return (
      <Input
        autoFocus
        className="h-7 text-sm"
        value={current}
        onChange={e => setEditData(p => ({ ...p, [field]: e.target.value }))}
        onBlur={() => setEditing(false)}
        onKeyDown={e => e.key === 'Enter' && setEditing(false)}
      />
    );
  }
  return (
    <span className="text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors" onClick={() => setEditing(true)}>
      {current || <span className="text-muted-foreground">–</span>}
    </span>
  );
}

function EditableNumber({ value, field, editData, setEditData }: {
  value: number | null | undefined; field: string; editData: Record<string, any>; setEditData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const [editing, setEditing] = useState(false);
  const current = field in editData ? editData[field] : (value ?? '');
  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        className="h-7 text-sm text-right tabular-nums"
        value={current}
        onChange={e => setEditData(p => ({ ...p, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
        onBlur={() => setEditing(false)}
        onKeyDown={e => e.key === 'Enter' && setEditing(false)}
      />
    );
  }
  const display = field in editData ? fmt(editData[field]) : fmt(value);
  return (
    <span className="text-sm font-medium tabular-nums cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors" onClick={() => setEditing(true)}>
      {display}
    </span>
  );
}

function EditableSelect({ value, field, options, editData, setEditData }: {
  value: string | null; field: string; options: string[]; editData: Record<string, any>; setEditData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const current = field in editData ? editData[field] : (value ?? '');
  return (
    <Select value={current} onValueChange={v => setEditData(p => ({ ...p, [field]: v }))}>
      <SelectTrigger className="h-7 text-sm">
        <SelectValue placeholder="–" />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function EditableMultiSelect({ value, field, options, editData, setEditData }: {
  value: string[] | null; field: string; options: string[]; editData: Record<string, any>; setEditData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const [open, setOpen] = useState(false);
  const current: string[] = field in editData ? (editData[field] || []) : (value || []);

  const toggle = (item: string) => {
    const next = current.includes(item) ? current.filter(x => x !== item) : [...current, item];
    setEditData(p => ({ ...p, [field]: next }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex flex-wrap gap-1 cursor-pointer min-h-[28px] items-center hover:bg-muted/50 rounded px-1 -mx-1 transition-colors">
          {current.length > 0 ? current.map(b => (
            <Badge key={b} variant="secondary" className="text-[10px] rounded-[4px]">{b}</Badge>
          )) : <span className="text-sm text-muted-foreground">–</span>}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-60 max-h-64 overflow-y-auto p-2" align="start">
        {options.map(o => (
          <button
            key={o}
            className={cn(
              "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted/60 transition-colors",
              current.includes(o) && "bg-muted"
            )}
            onClick={() => toggle(o)}
          >
            <span className={cn("h-4 w-4 rounded border flex items-center justify-center", current.includes(o) ? "bg-primary border-primary" : "border-border")}>
              {current.includes(o) && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
            {o}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function EditableDate({ value, field, editData, setEditData }: {
  value: string | null; field: string; editData: Record<string, any>; setEditData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const current = field in editData ? editData[field] : value;
  const dateObj = current ? parseISO(current) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors h-7">
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          {dateObj ? format(dateObj, 'dd.MM.yyyy', { locale: de }) : <span className="text-muted-foreground">–</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateObj}
          onSelect={d => {
            setEditData(p => ({ ...p, [field]: d ? format(d, 'yyyy-MM-dd') : null }));
          }}
          className={cn("p-3 pointer-events-auto")}
          locale={de}
        />
      </PopoverContent>
    </Popover>
  );
}

function EditableCheckbox({ value, field, editData, setEditData }: {
  value: boolean | null; field: string; editData: Record<string, any>; setEditData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const current = field in editData ? editData[field] : (value ?? false);
  return (
    <button
      className={cn("h-5 w-5 rounded border flex items-center justify-center transition-colors", current ? "bg-primary border-primary" : "border-border hover:border-muted-foreground")}
      onClick={() => setEditData(p => ({ ...p, [field]: !current }))}
    >
      {current && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
    </button>
  );
}

/* ---------- Row wrappers ---------- */

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

/* ---------- Main ---------- */

export default function KundenSlidePanel({ deal: d, onClose }: KundenSlidePanelProps) {
  const [companyLogo, setCompanyLogo] = useState<{ logo_url: string | null; bg_color: string | null } | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const hasChanges = Object.keys(editData).length > 0;

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

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

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    const { error } = await supabase.from('close_deals').update(editData as any).eq('id', d.id);
    setSaving(false);
    if (error) {
      toast.error('Fehler beim Speichern');
      console.error(error);
    } else {
      // Merge into deal object in-place
      Object.assign(d, editData);
      setEditData({});
      toast.success('Gespeichert');
    }
  };

  const ks = (editData.kundenstatus ?? d.kundenstatus) || '–';
  const ampelRaw = (editData.ampel ?? d.ampel) || d.ampelstatus || '';
  const ampel = AMPEL_MAP[ampelRaw] || { dot: 'bg-muted', label: ampelRaw || '–' };
  const company = d.unternehmen || '';
  const bgColor = companyLogo?.bg_color || FALLBACK_BG[company] || '#374151';
  const logoUrl = companyLogo?.logo_url;

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

        {/* Save bar */}
        {hasChanges && (
          <div className="sticky top-0 z-10 bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-between">
            <span className="text-sm text-primary font-medium">Ungespeicherte Änderungen</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditData({})}>Verwerfen</Button>
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
                <EditableText value={d.vor_nachname} field="vor_nachname" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Email">
                <EditableText value={d.email} field="email" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Telefon">
                <EditableText value={d.telefon} field="telefon" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Website URL">
                <EditableText value={d.website_url} field="website_url" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Unternehmen">
                <EditableText value={d.unternehmen} field="unternehmen" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Branche">
                <EditableMultiSelect value={d.branche} field="branche" options={BRANCHE_OPTIONS} editData={editData} setEditData={setEditData} />
              </FieldRow>
              <div className="col-span-2">
                <FieldRow label="Projekttyp">
                  <EditableMultiSelect value={d.projekttyp} field="projekttyp" options={PROJEKTTYP_OPTIONS} editData={editData} setEditData={setEditData} />
                </FieldRow>
              </div>
              <FieldRow label="Laufzeit">
                <EditableSelect value={d.laufzeit} field="laufzeit" options={LAUFZEIT_OPTIONS} editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Startdatum">
                <EditableDate value={d.start_datum} field="start_datum" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Enddatum">
                <EditableDate value={d.end_datum} field="end_datum" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Deadline">
                <EditableDate value={d.deadline} field="deadline" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Laufzeit in 14T fällig">
                <EditableCheckbox value={d.laufzeit_in_14t} field="laufzeit_in_14t" editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Kundenstatus">
                <EditableSelect value={d.kundenstatus} field="kundenstatus" options={KUNDENSTATUS_OPTIONS} editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Ampelstatus">
                <EditableSelect value={d.ampel || d.ampelstatus} field="ampel" options={AMPEL_OPTIONS} editData={editData} setEditData={setEditData} />
              </FieldRow>
              <FieldRow label="Zahlstatus">
                <EditableSelect value={d.zahlstatus} field="zahlstatus" options={ZAHLSTATUS_OPTIONS} editData={editData} setEditData={setEditData} />
              </FieldRow>
            </div>
          </section>

          {/* FINANZEN */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Finanzen</h3>
            <div className="bg-muted/30 rounded-lg p-4">
              <FinRow label="Gesamt-Saldo">
                <EditableNumber value={d.gesamt_saldo ?? d.wert_eur} field="gesamt_saldo" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="Ads-Budget">
                <EditableNumber value={d.ads_budget} field="ads_budget" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="Cash Collect offen">
                <EditableNumber value={d.cash_collect_offen} field="cash_collect_offen" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="CLV">
                <EditableNumber value={d.clv} field="clv" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="Meta Kosten">
                <EditableNumber value={d.meta_kosten} field="meta_kosten" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="CRM Kosten">
                <EditableNumber value={d.crm_kosten} field="crm_kosten" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="Superchat Kosten">
                <EditableNumber value={d.superchat_kosten} field="superchat_kosten" editData={editData} setEditData={setEditData} />
              </FinRow>
              <FinRow label="Website Kosten">
                <EditableNumber value={d.website_kosten} field="website_kosten" editData={editData} setEditData={setEditData} />
              </FinRow>
            </div>
          </section>

          {/* Status alerts */}
          {(d.laufzeit_in_14t || (editData.laufzeit_in_14t ?? false)) && (
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
