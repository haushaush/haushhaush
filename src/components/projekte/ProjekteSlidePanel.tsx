import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { X, ExternalLink, Save, Users, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const STATUS_STYLES: Record<string, string> = {
  'Noch nicht gestartet': 'bg-destructive/20 text-destructive',
  'Onboarding / Planung': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'In Bearbeitung': 'bg-warning/20 text-warning',
  'Internes Review': 'bg-muted text-muted-foreground',
  'Client Review': 'bg-muted text-muted-foreground',
  'Laufzeitbetreuung': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Abgeschlossen': 'bg-success/20 text-success',
  'Pausiert': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

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

interface Props { project: any; onClose: () => void; }

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

/* Team member multi-select */
function TeamMemberMultiSelect({ selectedIds, allMembers, onChange }: {
  selectedIds: string[];
  allMembers: { notion_id: string; name: string; email: string; avatar_url?: string }[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = allMembers.filter(m => !selectedIds.includes(m.notion_id) && m.name.toLowerCase().includes(search.toLowerCase()));
  const selected = allMembers.filter(m => selectedIds.includes(m.notion_id));

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <div className="min-h-[34px] border border-input rounded-md px-2 py-1 flex flex-wrap gap-1 cursor-text bg-background" onClick={() => setOpen(true)}>
        {selected.map(m => (
          <span key={m.notion_id} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-[4px] flex items-center gap-1">
            <span className="h-4 w-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[7px] font-bold shrink-0">{getInitials(m.name)}</span>
            {m.name}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(selectedIds.filter(id => id !== m.notion_id)); }} className="hover:text-destructive font-medium">×</button>
          </span>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? 'Mitarbeiter suchen…' : ''}
          className="outline-none text-sm flex-1 min-w-[100px] bg-transparent text-foreground placeholder:text-muted-foreground" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[200] w-full bg-background border border-input rounded-md shadow-lg mt-1 max-h-[200px] overflow-y-auto">
          {filtered.map(m => (
            <div key={m.notion_id} onClick={() => { onChange([...selectedIds, m.notion_id]); setSearch(''); }}
              className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer transition-colors flex items-center gap-2">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt={m.name} className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[8px] font-bold">{getInitials(m.name)}</div>
              )}
              {m.name}
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

export default function ProjekteSlidePanel({ project: p, onClose }: Props) {
  const navigate = useNavigate();
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [linkedKunden, setLinkedKunden] = useState<{ id: string; client_name: string }[]>([]);
  const [allTeamMembers, setAllTeamMembers] = useState<{ notion_id: string; name: string; email: string; avatar_url?: string }[]>([]);
  const [linkedTeam, setLinkedTeam] = useState<{ notion_id: string; name: string; email: string; avatar_url?: string }[]>([]);

  useEffect(() => { setEditData({ ...p }); }, [p.id]);

  // Load all team members once
  useEffect(() => {
    supabase.from('team').select('notion_id, name, email, avatar_url').then(({ data }) => {
      setAllTeamMembers((data || []).filter((m: any) => m.notion_id));
    });
  }, []);

  // Load linked team members
  useEffect(() => {
    const ids: string[] = editData.verknuepfte_mitarbeiter_ids || [];
    if (ids.length === 0) { setLinkedTeam([]); return; }
    if (allTeamMembers.length === 0) return;
    setLinkedTeam(allTeamMembers.filter(m => ids.includes(m.notion_id)));
  }, [editData.verknuepfte_mitarbeiter_ids, allTeamMembers]);

  useEffect(() => {
    const ids = p.verknuepfte_kunden_ids || p.verknuepfte_kunden || [];
    if (ids.length === 0) { setLinkedKunden([]); return; }
    supabase.from('close_deals').select('id, client_name, notion_id').in('notion_id', ids)
      .then(({ data }) => setLinkedKunden(data || []));
  }, [p.id]);

  const upd = (k: string, v: any) => setEditData(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, ...rest } = editData;
    const { error } = await supabase.from('projects').update(rest as any).eq('id', p.id);
    if (error) toast.error('Fehler', { description: error.message });
    else toast.success('Gespeichert');
    setSaving(false);
  };

  const handleEsc = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('keydown', handleEsc); return () => document.removeEventListener('keydown', handleEsc); }, [handleEsc]);

  const name = editData.projektname || editData.name || 'Unbenannt';
  const status = editData.projektstatus || '–';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground'}`}>{status}</span>
              {editData.prioritaet && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{editData.prioritaet}</span>
              )}
            </div>
            <h2 className="text-lg font-heading font-bold truncate">{name}</h2>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {editData.notion_url && (
              <a href={editData.notion_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-md hover:bg-muted transition-colors" title="In Notion öffnen">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* DETAILS */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Projektname">
                <Input className="h-[34px] text-sm" value={editData.projektname || ''} onChange={e => upd('projektname', e.target.value)} />
              </FieldRow>
              <FieldRow label="Projektstatus">
                <SearchableSingleSelect value={editData.projektstatus || ''} options={PROJEKTSTATUS_OPTIONS} onChange={v => upd('projektstatus', v)} placeholder="Status…" />
              </FieldRow>
              <FieldRow label="Priorität">
                <SearchableSingleSelect value={editData.prioritaet || ''} options={PRIORITAET_OPTIONS} onChange={v => upd('prioritaet', v)} placeholder="Priorität…" />
              </FieldRow>
              <FieldRow label="Laufzeit">
                <SearchableSingleSelect value={editData.laufzeit || ''} options={LAUFZEIT_OPTIONS} onChange={v => upd('laufzeit', v)} placeholder="Laufzeit…" />
              </FieldRow>
              <FieldRow label="Zahlstatus">
                <SearchableSingleSelect value={editData.zahlstatus || ''} options={ZAHLSTATUS_OPTIONS} onChange={v => upd('zahlstatus', v)} placeholder="Zahlstatus…" />
              </FieldRow>
            </div>
            <FieldRow label="Typ">
              <SearchableMultiSelect value={Array.isArray(editData.typ) ? editData.typ : []} options={TYP_OPTIONS} onChange={v => upd('typ', v)} placeholder="Typ hinzufügen…" />
            </FieldRow>
            <FieldRow label="Branche">
              <SearchableMultiSelect value={Array.isArray(editData.branche) ? editData.branche : []} options={BRANCHE_OPTIONS} onChange={v => upd('branche', v)} placeholder="Branche hinzufügen…" />
            </FieldRow>
          </section>


          {/* MITARBEITER */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Mitarbeiter
            </h3>
            {/* Display from Notion people field */}
            {(() => {
              const members: { id: string; name: string; avatar_url?: string | null }[] = Array.isArray(editData.mitarbeiter) ? editData.mitarbeiter : [];
              if (members.length === 0) return <p className="text-xs text-muted-foreground">Keine Mitarbeiter verknüpft</p>;
              return (
                <div className="flex flex-wrap gap-2">
                  {members.map(m => {
                    const initials = (m.name || '?').split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
                    return (
                      <div key={m.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-2.5 py-1.5">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt={m.name} className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-bold">{initials}</div>
                        )}
                        <p className="text-xs font-medium truncate">{m.name}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {/* Editable multi-select (maps to team table for adding) */}
            <TeamMemberMultiSelect
              selectedIds={Array.isArray(editData.verknuepfte_mitarbeiter_ids) ? editData.verknuepfte_mitarbeiter_ids : []}
              allMembers={allTeamMembers}
              onChange={ids => upd('verknuepfte_mitarbeiter_ids', ids)}
            />
          </section>

          {/* ZEITRAUM */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zeitraum</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Startdatum">
                <DatePickerField value={editData.startdatum || null} onChange={v => upd('startdatum', v)} />
              </FieldRow>
              <FieldRow label="Enddatum">
                <DatePickerField value={editData.enddatum || null} onChange={v => upd('enddatum', v)} />
              </FieldRow>
              <FieldRow label="Deadline">
                <DatePickerField value={editData.deadline || null} onChange={v => upd('deadline', v)} />
              </FieldRow>
              <FieldRow label="Zahldatum">
                <DatePickerField value={editData.zahldatum || null} onChange={v => upd('zahldatum', v)} />
              </FieldRow>
              <FieldRow label="Umsatz geschr. am">
                <DatePickerField value={editData.umsatz_geschr_am || null} onChange={v => upd('umsatz_geschr_am', v)} />
              </FieldRow>
            </div>
          </section>

          {/* FINANZEN */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Finanzen</h3>
            <div className="bg-muted/30 rounded-lg px-4 py-2">
              {([
                ['Ads-Budget', 'ads_budget'],
                ['Cash Collect', 'cash_collect'],
                ['Offener Cash Collect', 'offener_cash_collect'],
                ['Aktuelle Rate', 'aktuelle_rate'],
                ['1. Rate', 'rate_1'],
                ['2. Rate', 'rate_2'],
                ['3. Rate', 'rate_3'],
                ['4. Rate', 'rate_4'],
                ['5. Rate', 'rate_5'],
              ] as [string, string][]).map(([label, field]) => (
                <FinRow key={field} label={label}>
                  <Input type="number" className="h-[34px] text-sm text-right tabular-nums w-32"
                    value={editData[field] ?? ''} onChange={e => upd(field, e.target.value === '' ? null : Number(e.target.value))} />
                </FinRow>
              ))}
            </div>
          </section>

          {/* SONSTIGES */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sonstiges</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Aktueller Monat">
                <Input className="h-[34px] text-sm" value={editData.aktueller_monat || ''} onChange={e => upd('aktueller_monat', e.target.value)} />
              </FieldRow>
              <FieldRow label="Monat + Leadanzahl">
                <Input className="h-[34px] text-sm" value={editData.monat_leadanzahl || ''} onChange={e => upd('monat_leadanzahl', e.target.value)} />
              </FieldRow>
            </div>
            <div className="space-y-2 pt-1">
              {([
                ['Cash Collect übernommen', 'cash_collect_uebernommen'],
                ['Mail Gesendet?', 'mail_gesendet'],
                ['Deadline? (Management)', 'deadline_management'],
                ['Deadline? (Mitarbeiter)', 'deadline_mitarbeiter'],
              ] as [string, string][]).map(([label, field]) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={!!editData[field]} onCheckedChange={v => upd(field, !!v)} />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Linked Customers */}
          {linkedKunden.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Verknüpfte Kunden
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {linkedKunden.map(k => (
                  <button key={k.id} onClick={() => { onClose(); navigate(`/kunden?kunde=${k.id}`); }}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                    {k.client_name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {editData.letztes_update && (
            <p className="text-[11px] text-muted-foreground/60">
              Letztes Update: {editData.letztes_update ? (() => { try { return new Date(editData.letztes_update).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return editData.letztes_update; } })() : '–'}
            </p>
          )}
        </div>

        {/* Sticky save footer */}
        <div className="sticky bottom-0 border-t border-border bg-background px-6 py-3 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px]">
            <Save className="h-4 w-4 mr-2" />{saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </div>
    </div>
  );
}
