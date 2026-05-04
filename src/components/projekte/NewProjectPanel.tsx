import { useEffect, useCallback, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { X, CalendarIcon, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const PROJEKTSTATUS_OPTIONS = [
  'Noch nicht gestartet', 'Onboarding / Planung', 'In Bearbeitung', 'Internes Review',
  'Client Review', 'Laufzeitbetreuung', 'Abgeschlossen', 'Pausiert',
];
const PRIORITAET_OPTIONS = ['Hoch', 'Mittel', 'Niedrig'];
const LAUFZEIT_OPTIONS = ['Einmalig', 'Unbegrenzt', '1 Monat', '2 Monate', '3 Monate', '4 Monate', '5 Monate', '6 Monate', '12 Monate'];
const ZAHLSTATUS_OPTIONS = [
  'in Bearbeitung', 'Rechnung zu erstellen', 'Rechnung nicht versendet',
  'RE versendet / Zahlung ausstehend', '1. Rate fällig', '2. Rate fällig', '3. Rate fällig',
  'HHS an VC', 'VC an HHs', 'DONE', 'Fällig in 7T',
];
const TYP_OPTIONS = [
  'Meta Werbeanzeigen', 'Meta Werbebudget', 'Google Werbeanzeigen',
  'Onepage Website - Onepage', 'Onepage Website - Webflow', 'Branding Website - Webflow',
  'Ads Landing Page - Onepage', 'Ads Landing Page - Perspective', 'Printdesign',
  'Fotoshooting', 'Google Unternehmensprofil', 'Development', 'Videoshooting',
  'Leads Kaufen', 'Design', 'CRM', 'SEO', 'Social Media', 'Tech Support',
  'Vorqualifikation', 'Superchat', 'Leadkauf', 'Freebie erstellen',
];
const BRANCHE_OPTIONS = [
  'PKV', 'BU', 'Rechtsschutz', 'TKV', 'Unfallversicherung', 'Automotive', 'Handwerk',
  'Allfinanz', 'Immobilien', 'Versicherung', 'Solar', 'Zahnzusatz', 'Beihilfe - PKV',
  'Private Krankenversicherung', 'Tierkrankenversicherung', 'KFZ', 'Altersvorsorge',
  'Sterbegeld', 'Kindervorsorge', 'Haftpflicht', 'Wohngebäude', 'RS', 'Aviation', 'Andere',
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

/* ── Reusable form pieces ─────────────────────── */

function FieldRow({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </div>
  );
}

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

function MitarbeiterSelect({ selected, allMembers, onChange }: {
  selected: { id: string; name: string; email: string }[];
  allMembers: { id: string; name: string; email: string; position?: string; avatar_url?: string }[];
  onChange: (members: { id: string; name: string; email: string }[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedIds = selected.map(s => s.id);
  const filtered = allMembers.filter(m => !selectedIds.includes(m.id) && (m.name.toLowerCase().includes(search.toLowerCase()) || (m.position || '').toLowerCase().includes(search.toLowerCase())));

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const getInitials = (name?: string | null) => (!name ? '??' : name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase());

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <div className="min-h-[34px] border border-input rounded-md px-2 py-1 flex flex-wrap gap-1 cursor-text bg-background" onClick={() => setOpen(true)}>
        {selected.map(m => (
          <span key={m.id} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-[4px] flex items-center gap-1">
            <span className="h-4 w-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[7px] font-bold shrink-0">{getInitials(m.name)}</span>
            {m.name}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(selected.filter(s => s.id !== m.id)); }} className="hover:text-destructive font-medium">×</button>
          </span>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? 'Mitarbeiter suchen…' : ''}
          className="outline-none text-sm flex-1 min-w-[100px] bg-transparent text-foreground placeholder:text-muted-foreground" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[200] w-full bg-background border border-input rounded-md shadow-lg mt-1 max-h-[200px] overflow-y-auto">
          {filtered.map(m => (
            <div key={m.id} onClick={() => { onChange([...selected, { id: m.id, name: m.name, email: m.email }]); setSearch(''); }}
              className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer transition-colors flex items-center gap-2">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt={m.name} className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[8px] font-bold">{getInitials(m.name)}</div>
              )}
              <span>{m.name}</span>
              {m.position && <span className="text-muted-foreground text-xs ml-auto">{m.position}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DatePickerField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const dateObj = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()}
          className={cn("flex items-center gap-2 w-full h-[34px] border border-input rounded-md px-2 text-sm bg-background text-left", !dateObj && "text-muted-foreground")}>
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {dateObj ? format(dateObj, 'dd.MM.yyyy', { locale: de }) : 'Datum wählen…'}
          {dateObj && (
            <button type="button" className="ml-auto hover:text-destructive" onClick={e => { e.stopPropagation(); onChange(null); }}>
              <X className="h-3 w-3" />
            </button>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[300]" align="start" onClick={e => e.stopPropagation()}>
        <Calendar mode="single" selected={dateObj} onSelect={d => onChange(d ? format(d, 'yyyy-MM-dd') : null)} locale={de} className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}

/* ── Main component ──────────────────────────── */

export default function NewProjectPanel({ onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; client_name: string; notion_id: string | null }[]>([]);
  const [allTeamMembers, setAllTeamMembers] = useState<{ id: string; name: string; email: string; position?: string; avatar_url?: string }[]>([]);
  const [form, setForm] = useState({
    projektname: '',
    projektstatus: 'Noch nicht gestartet',
    prioritaet: '',
    typ: [] as string[],
    branche: [] as string[],
    laufzeit: '',
    zahlstatus: '',
    customer_id: '', // close_deals id
    mitarbeiter: [] as { id: string; name: string; email: string }[],
    startdatum: null as string | null,
    enddatum: null as string | null,
    deadline: null as string | null,
    ads_budget: '',
    cash_collect: '',
  });

  useEffect(() => {
    supabase.from('close_deals').select('id, client_name, notion_id').order('client_name').then(({ data }) => {
      setCustomers(data || []);
    });
    supabase.from('team').select('id, name, email, position, avatar_url').order('name').then(({ data }) => {
      setAllTeamMembers((data || []).filter((m: any) => m.id));
    });
  }, []);

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const selectedCustomer = customers.find(c => c.id === form.customer_id);
  const customerOptions = customers.map(c => c.client_name);

  const handleSave = async () => {
    if (!form.projektname.trim()) {
      toast.error('Projektname ist erforderlich');
      return;
    }
    setSaving(true);
    try {
      const insertData: Record<string, any> = {
        name: form.projektname.trim(),
        projektname: form.projektname.trim(),
        projektstatus: form.projektstatus,
        status: 'Aktiv',
      };
      if (form.prioritaet) insertData.prioritaet = form.prioritaet;
      if (form.typ.length > 0) insertData.typ = form.typ;
      if (form.branche.length > 0) insertData.branche = form.branche;
      if (form.laufzeit) insertData.laufzeit = form.laufzeit;
      if (form.zahlstatus) insertData.zahlstatus = form.zahlstatus;
      if (form.startdatum) insertData.startdatum = form.startdatum;
      if (form.enddatum) insertData.enddatum = form.enddatum;
      if (form.deadline) insertData.deadline = form.deadline;
      if (form.ads_budget) insertData.ads_budget = parseFloat(form.ads_budget);
      if (form.cash_collect) insertData.cash_collect = parseFloat(form.cash_collect);
      if (form.mitarbeiter.length > 0) insertData.mitarbeiter = form.mitarbeiter;

      // Link customer via verknuepfte_kunden_ids
      if (selectedCustomer?.notion_id) {
        insertData.verknuepfte_kunden_ids = [selectedCustomer.notion_id];
      }

      const { error } = await supabase.from('projects').insert(insertData as any);
      if (error) throw error;

      toast.success('Projekt erstellt');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error('Fehler beim Erstellen', { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[180] backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border z-[190] flex flex-col animate-in slide-in-from-right-full duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-heading font-bold">Neues Projekt</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" onClick={e => e.stopPropagation()}>
          {/* DETAILS */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Details</h3>
            <div className="space-y-3">
              <FieldRow label="Projektname" required>
                <Input value={form.projektname} onChange={e => set('projektname', e.target.value)} placeholder="Projektname eingeben…" className="h-[34px] text-sm" />
              </FieldRow>
              <FieldRow label="Projektstatus">
                <SearchableSingleSelect value={form.projektstatus} options={PROJEKTSTATUS_OPTIONS} onChange={v => set('projektstatus', v || 'Noch nicht gestartet')} />
              </FieldRow>
              <FieldRow label="Priorität">
                <SearchableSingleSelect value={form.prioritaet} options={PRIORITAET_OPTIONS} onChange={v => set('prioritaet', v)} placeholder="Priorität wählen…" />
              </FieldRow>
              <FieldRow label="Typ">
                <SearchableMultiSelect value={form.typ} options={TYP_OPTIONS} onChange={v => set('typ', v)} placeholder="Typ wählen…" />
              </FieldRow>
              <FieldRow label="Branche">
                <SearchableMultiSelect value={form.branche} options={BRANCHE_OPTIONS} onChange={v => set('branche', v)} placeholder="Branche wählen…" />
              </FieldRow>
              <FieldRow label="Laufzeit">
                <SearchableSingleSelect value={form.laufzeit} options={LAUFZEIT_OPTIONS} onChange={v => set('laufzeit', v)} placeholder="Laufzeit wählen…" />
              </FieldRow>
              <FieldRow label="Zahlstatus">
                <SearchableSingleSelect value={form.zahlstatus} options={ZAHLSTATUS_OPTIONS} onChange={v => set('zahlstatus', v)} placeholder="Zahlstatus wählen…" />
              </FieldRow>
              <FieldRow label="Verknüpfter Kunde">
                <SearchableSingleSelect
                  value={selectedCustomer?.client_name || ''}
                  options={customerOptions}
                  onChange={name => {
                    const match = customers.find(c => c.client_name === name);
                    set('customer_id', match?.id || '');
                  }}
                  placeholder="Kunde suchen…"
                />
              </FieldRow>
            </div>
          </div>

          {/* MITARBEITER */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Mitarbeiter</h3>
            <MitarbeiterSelect
              selected={form.mitarbeiter}
              allMembers={allTeamMembers}
              onChange={members => set('mitarbeiter', members)}
            />
          </div>

          {/* ZEITRAUM */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Zeitraum</h3>
            <div className="space-y-3">
              <FieldRow label="Startdatum"><DatePickerField value={form.startdatum} onChange={v => set('startdatum', v)} /></FieldRow>
              <FieldRow label="Enddatum"><DatePickerField value={form.enddatum} onChange={v => set('enddatum', v)} /></FieldRow>
              <FieldRow label="Deadline"><DatePickerField value={form.deadline} onChange={v => set('deadline', v)} /></FieldRow>
            </div>
          </div>

          {/* FINANZEN */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Finanzen</h3>
            <div className="space-y-3">
              <FieldRow label="Ads Budget (€)">
                <Input type="number" value={form.ads_budget} onChange={e => set('ads_budget', e.target.value)} placeholder="0" className="h-[34px] text-sm" />
              </FieldRow>
              <FieldRow label="Cash Collect (€)">
                <Input type="number" value={form.cash_collect} onChange={e => set('cash_collect', e.target.value)} placeholder="0" className="h-[34px] text-sm" />
              </FieldRow>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="border-t border-border px-5 py-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Abbrechen</Button>
          <Button className="flex-1 gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern…' : 'Projekt erstellen'}
          </Button>
        </div>
      </div>
    </>
  );
}
