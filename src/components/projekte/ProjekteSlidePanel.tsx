import { useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ExternalLink, Save, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '–';
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
};

interface Props {
  project: any;
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

export default function ProjekteSlidePanel({ project: p, onClose }: Props) {
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditData({ ...p });
  }, [p.id]);

  const upd = (k: string, v: any) => setEditData(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, ...rest } = editData;
    const { error } = await supabase.from('projects').update(rest as any).eq('id', p.id);
    if (error) { toast.error('Fehler', { description: error.message }); }
    else { toast.success('Projekt gespeichert'); }
    setSaving(false);
  };

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [handleEsc]);

  const name = editData.projektname || editData.name || 'Unbenannt';
  const status = editData.projektstatus || '–';
  const typArr = Array.isArray(editData.typ) ? editData.typ : [];
  const brancheArr = Array.isArray(editData.branche) ? editData.branche : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-background shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground'}`}>
                {status}
              </span>
              {editData.prioritaet && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {editData.prioritaet}
                </span>
              )}
            </div>
            <h2 className="text-lg font-heading font-bold truncate">{name}</h2>
            {typArr.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {typArr.map((t: string) => (
                  <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {editData.notion_url && (
              <a href={editData.notion_url} target="_blank" rel="noreferrer"
                className="p-1.5 rounded-md hover:bg-muted transition-colors" title="In Notion öffnen">
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
          {/* Details */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Projektstatus">
                <Input className="h-[34px] text-sm" value={editData.projektstatus || ''} onChange={e => upd('projektstatus', e.target.value)} />
              </FieldRow>
              <FieldRow label="Priorität">
                <Input className="h-[34px] text-sm" value={editData.prioritaet || ''} onChange={e => upd('prioritaet', e.target.value)} />
              </FieldRow>
              <FieldRow label="Laufzeit">
                <Input className="h-[34px] text-sm" value={editData.laufzeit || ''} onChange={e => upd('laufzeit', e.target.value)} />
              </FieldRow>
              <FieldRow label="Zahlstatus">
                <Input className="h-[34px] text-sm" value={editData.zahlstatus || ''} onChange={e => upd('zahlstatus', e.target.value)} />
              </FieldRow>
            </div>
          </section>

          {/* Branche */}
          {brancheArr.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branche</h3>
              <div className="flex flex-wrap gap-1">
                {brancheArr.map((b: string) => (
                  <span key={b} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{b}</span>
                ))}
              </div>
            </section>
          )}

          {/* Dates */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zeitraum</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Startdatum">
                <Input type="date" className="h-[34px] text-sm" value={editData.startdatum || ''} onChange={e => upd('startdatum', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Enddatum">
                <Input type="date" className="h-[34px] text-sm" value={editData.enddatum || ''} onChange={e => upd('enddatum', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Deadline">
                <Input type="date" className="h-[34px] text-sm" value={editData.deadline || ''} onChange={e => upd('deadline', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Zahldatum">
                <Input type="date" className="h-[34px] text-sm" value={editData.zahldatum || ''} onChange={e => upd('zahldatum', e.target.value || null)} />
              </FieldRow>
            </div>
          </section>

          {/* Financials */}
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

          {/* Extra info */}
          {(editData.aktueller_monat || editData.monat_leadanzahl) && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zusatzinfos</h3>
              <div className="grid grid-cols-2 gap-3">
                {editData.aktueller_monat && (
                  <FieldRow label="Aktueller Monat">
                    <span className="text-sm">{editData.aktueller_monat}</span>
                  </FieldRow>
                )}
                {editData.monat_leadanzahl && (
                  <FieldRow label="Monat + Leadanzahl">
                    <span className="text-sm">{editData.monat_leadanzahl}</span>
                  </FieldRow>
                )}
              </div>
            </section>
          )}

          {editData.letztes_update && (
            <p className="text-[11px] text-muted-foreground/60">
              Letztes Update: {fmtDate(editData.letztes_update)}
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
