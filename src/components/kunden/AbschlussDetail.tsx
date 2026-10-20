import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wallet } from 'lucide-react';

/** Splits Close's comma list, keeping commas inside parentheses ("AA - Termin System (A, B)"). */
export function leistungenListe(s: string | null | undefined): string[] {
  if (!s) return [];
  const out: string[] = []; let tiefe = 0, akt = '';
  for (const ch of s) {
    if (ch === '(') tiefe++; else if (ch === ')') tiefe = Math.max(0, tiefe - 1);
    if (ch === ',' && tiefe === 0) { if (akt.trim()) out.push(akt.trim()); akt = ''; } else akt += ch;
  }
  if (akt.trim()) out.push(akt.trim());
  return out;
}

export function LeistungenChips({ wert }: { wert: string | null }) {
  const l = leistungenListe(wert);
  if (!l.length) return <span className="text-muted-foreground">–</span>;
  const rest = l.slice(2);
  return (
    <div className="flex flex-wrap gap-1 max-w-[260px]">
      {l.slice(0, 2).map((x, i) => <Badge key={i} variant="outline" className="text-xs font-normal px-1.5 py-0 max-w-[180px] truncate" title={x}>{x}</Badge>)}
      {rest.length > 0 && (
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Badge variant="secondary" className="text-xs px-1.5 py-0 cursor-default">+{rest.length}</Badge>
        </TooltipTrigger><TooltipContent><ul className="text-xs space-y-0.5">{rest.map((x, i) => <li key={i}>{x}</li>)}</ul></TooltipContent></Tooltip></TooltipProvider>
      )}
    </div>
  );
}

const eur = (n: unknown) => n == null || n === '' ? null : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n));
const dt = (d: unknown) => d ? new Date(String(d)).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
const dtz = (d: unknown) => d ? new Date(String(d)).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
const leer = (v: unknown) => v == null || (typeof v === 'string' && !v.trim());

type Feld = [string, React.ReactNode];
const NICHT_GEPFLEGT = <span className="text-xs italic text-muted-foreground">in Noahs Close nicht gepflegt</span>;

function Gruppe({ titel, felder }: { titel: string; felder: Feld[] }) {
  const da = felder.filter(([, v]) => !leer(v));
  if (!da.length) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">{titel}</div>
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-xs">
        {da.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums break-words">{v}</dd></Fragment>)}
      </dl>
    </div>
  );
}

type Notiz = { id: string; date_created: string | null; user_name: string | null; body_preview: string | null };

function Notizen({ leadId }: { leadId: string | null }) {
  const [rows, setRows] = useState<Notiz[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [alle, setAlle] = useState(false);
  useEffect(() => {
    if (!leadId) { setRows([]); return; }
    supabase.from('close_activities').select('id, date_created, user_name, body_preview')
      .eq('activity_type', 'Note').eq('close_lead_id', leadId).order('date_created', { ascending: false })
      .then(({ data, error }) => { if (error) { console.error('Notizen', error); setFehler(error.message); } setRows((data as Notiz[]) || []); });
  }, [leadId]);
  const sichtbar = rows ? (alle ? rows : rows.slice(0, 3)) : [];
  return (
    <div className="md:col-span-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Notizen aus Close</div>
      {fehler ? <p className="text-xs text-destructive">Notizen nicht lesbar: {fehler}</p>
        : !rows ? <p className="text-xs text-muted-foreground">Lade …</p>
        : !rows.length ? <p className="text-xs text-muted-foreground">Keine Notizen zu diesem Lead.</p> : (
          <div className="space-y-2">
            {sichtbar.map(n => (
              <div key={n.id} className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                <div className="text-muted-foreground mb-0.5 tabular-nums">{dtz(n.date_created)}{n.user_name ? ` · ${n.user_name}` : ''}</div>
                <div className="whitespace-pre-wrap">{n.body_preview || <span className="italic text-muted-foreground">ohne Text</span>}</div>
              </div>
            ))}
            {rows.length > 3 && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setAlle(a => !a)}>
                {alle ? 'weniger anzeigen' : `alle ${rows.length} Notizen anzeigen`}
              </Button>
            )}
          </div>
        )}
    </div>
  );
}

/** Expanded detail row for one deal. `d` = view row merged with the full close_abschluesse row (Haush Haush only). */
export function AbschlussDetail({ d }: { d: Record<string, any> }) {
  const vc = d.quelle === 'Viral Connect';
  const vcFeld = (v: unknown, f: (x: unknown) => React.ReactNode) => leer(v) ? (vc ? NICHT_GEPFLEGT : null) : f(v);
  const upsellEintraege = d.upsell && typeof d.upsell === 'object'
    ? Object.entries(d.upsell as Record<string, unknown>).filter(([, v]) => !leer(v)) : [];
  const upsell: Feld[] = [
    ...upsellEintraege.map(([k, v]) => [k.replace(/\s*\(Upsell\)\s*$/, ''), typeof v === 'object' ? JSON.stringify(v) : String(v)] as Feld),
    ['Upsell-Start', dt(d.upsell_startdatum)],
    ['Upsell-Laufzeit', d.upsell_laufzeit != null ? `${d.upsell_laufzeit} Mon.` : null],
  ];
  return (
    <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 py-2">
      <Gruppe titel="Vertrieb" felder={[['Closer', d.closer], ['Setter', d.setter], ['Cold Caller', d.cold_caller], ['Close-Typ', d.close_typ]]} />
      <Gruppe titel="Einordnung" felder={[['Branche', d.branche], ['Sub-Niche', d.sub_niche], ['Kanal', d.kanal], ['Marke', d.marke], ['Quelle', d.quelle]]} />
      <Gruppe titel="Werte" felder={[
        ['Abschlusswert', eur(d.abschlusswert)],
        ['Setup-Fee', vcFeld(d.setup_fee, eur)],
        ['Retainer/Monat', vcFeld(d.retainer_monat, eur)],
        ['Wert-Periode', d.wert_periode],
        ['Laufzeit', vcFeld(d.laufzeit_monate, v => `${v} Mon.`)],
        ['Startdatum', vcFeld(d.startdatum, dt)],
      ]} />
      <Gruppe titel="Upsell" felder={upsellEintraege.length || d.upsell_startdatum || d.upsell_laufzeit != null ? upsell : []} />
      <Gruppe titel="Abgang" felder={[['Kündigungsdatum', dt(d.kuendigungsdatum)], ['Letzter Vertragstag', dt(d.letzter_vertragstag)], ['Abgangsgrund', d.abgangsgrund], ['Abgangs-Begründung', d.abgangs_begruendung]]} />
      <Gruppe titel="Verlauf" felder={[['Angelegt von', d.angelegt_von], ['Angelegt am', dtz(d.angelegt_am)], ['Status geändert', dtz(d.status_geaendert_am)], ['Abgeglichen', dtz(d.synced_at)]]} />
      {d.client_id && (
        <div className="md:col-span-2">
          <Link to={`/kunden/${d.client_id}?tab=verknuepfungen`} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Wallet className="h-3.5 w-3.5" />Werbebudget des Kunden ansehen
          </Link>
        </div>
      )}
      <Notizen leadId={d.close_lead_id} />
    </div>
  );
}
