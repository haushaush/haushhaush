import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import type { Database } from '@/integrations/supabase/types';

// Presentation only: every figure comes from the view `kunde_kennzahlen`; nothing is calculated here.
export type Kennzahlen = Database['public']['Views']['kunde_kennzahlen']['Row'];

const eur = (v: number | null | undefined) => v == null ? null : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v));
const dat = (d: string | null | undefined) => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : null;
const zahl = (n: number | null | undefined) => n == null ? null : new Intl.NumberFormat('de-DE').format(n);

const LAGE: Record<string, { text: string; warn?: boolean }> = {
  bezahlt: { text: 'Werbebudget bezahlt' },
  fehlt_obwohl_pflicht: { text: 'Werbebudget fehlt — läuft über unsere Untermarke', warn: true },
  zahlt_meta_direkt: { text: 'zahlt Meta direkt' },
  unbekannt: { text: 'keine Werbebudget-Zuordnung' },
};

export function useKundeKennzahlen(clientId?: string | null) {
  const [kz, setKz] = useState<Kennzahlen | null>(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    supabase.from('kunde_kennzahlen').select('*').eq('client_id', clientId).maybeSingle().then(({ data, error }) => {
      if (error) { console.error('kunde_kennzahlen', error); setFehler(error.message); }
      setKz((data as Kennzahlen) ?? null); setLoading(false);
    });
  }, [clientId]);
  return { kz, loading, fehler };
}

const KARTE = 'rounded-3xl bg-card p-6 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)]';

function HKarte({ titel, farbe, wert, leer, satz, children }: { titel: string; farbe: string; wert: string | null; leer?: string; satz?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={KARTE}>
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold" style={{ color: farbe }}><span className="h-2 w-2 rounded-full shrink-0" style={{ background: farbe }} />{titel}</p>
      {wert != null
        ? <p className="text-4xl font-semibold tabular-nums leading-none mt-4 text-foreground">{wert}</p>
        : <p className="text-sm text-muted-foreground mt-4">{leer || '—'}</p>}
      {satz && <p className="text-sm tabular-nums mt-2 text-muted-foreground">{satz}</p>}
      {children && <div className="mt-4 divide-y divide-border/50 text-sm tabular-nums">{children}</div>}
    </div>
  );
}
function Zeile({ l, v, leer, cls }: { l: string; v: string | null; leer?: string; cls?: string }) {
  return <div className="flex justify-between gap-3 py-2"><span className="text-muted-foreground">{l}</span><span className={`text-right ${v == null ? 'text-muted-foreground' : cls || ''}`}>{v ?? leer ?? '—'}</span></div>;
}

const F = { abschluss: 'hsl(var(--akzent-bernstein))', rechnung: 'hsl(var(--cat-1))', budget: 'hsl(var(--cat-3))', kampagne: 'hsl(var(--cat-4))', betreuung: 'hsl(var(--cat-7))', manuell: 'hsl(var(--muted-foreground))' };

export function KundeKennzahlenKarten({ kz, loading, fehler }: { kz: Kennzahlen | null; loading: boolean; fehler: string | null }) {
  if (loading) return <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-40 rounded-3xl" />)}</div>;
  if (fehler) return <p className="text-sm text-destructive">Kennzahlen nicht geladen: {fehler}</p>;
  if (!kz) return <p className="text-sm text-muted-foreground">Für diesen Kunden liegen keine berechneten Kennzahlen vor.</p>;
  const keineRechnung = !kz.rechnungen;
  const lage = kz.werbebudget_lage ? LAGE[kz.werbebudget_lage] : null;
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      <HKarte titel="Abschluss" farbe={F.abschluss} wert={eur(kz.abschlusswert)} leer="kein Abschluss erfasst"
        satz={<>{kz.wert_quelle === 'close' ? 'aus Close' : kz.wert_quelle === 'slack' ? 'aus Slack' : 'ohne Herkunft'} · {zahl(kz.deals) ?? '—'} Abschlüsse in Close</>} />

      <HKarte titel="Rechnungen" farbe={F.rechnung} wert={keineRechnung ? null : eur(kz.offen)} leer="keine Rechnung"
        satz={keineRechnung ? (kz.buchhaltungsquelle ? `Quelle: ${kz.buchhaltungsquelle}` : 'keine Buchhaltungsquelle verknüpft') : <>offen · {zahl(kz.rechnungen)} Rechnungen{kz.buchhaltungsquelle ? ` · ${kz.buchhaltungsquelle}` : ''}</>}>
        {!keineRechnung && <>
          {kz.ueberfaellig != null && kz.ueberfaellig > 0 && <p className="py-2 text-destructive">{zahl(kz.ueberfaellig)} Rechnung{kz.ueberfaellig === 1 ? '' : 'en'} überfällig</p>}
          <Zeile l="Fakturiert" v={eur(kz.fakturiert)} />
          <Zeile l="Bezahlt" v={eur(kz.bezahlt)} />
          <Zeile l="Cash-Collect-Quote" v={kz.cash_collect_quote == null ? null : `${kz.cash_collect_quote} %`} leer="nichts fakturiert" />
          <Zeile l="Letzte Rechnung" v={dat(kz.letzte_rechnung)} />
          <Zeile l="Letzte Zahlung" v={dat(kz.letzte_zahlung)} leer="noch keine Zahlung" />
        </>}
      </HKarte>

      <HKarte titel="Werbebudget" farbe={F.budget} wert={eur(kz.werbebudget_rest)} leer={kz.werbebudget_eingezahlt == null ? 'kein Werbebudget eingezahlt' : 'Rest nicht bestimmbar'}
        satz={lage ? <span className={lage.warn ? 'text-warning-foreground dark:text-warning font-medium' : ''}>{lage.text}</span> : null}>
        <Zeile l="Eingezahlt (netto)" v={eur(kz.werbebudget_eingezahlt)} leer="keine Zahlung" />
        <Zeile l="Bei Meta ausgegeben" v={eur(kz.meta_ausgaben)} leer="kein eindeutiges Konto zugeordnet" />
        <Zeile l="Rest" v={eur(kz.werbebudget_rest)} cls={kz.werbebudget_rest != null && kz.werbebudget_rest < 0 ? 'text-destructive' : ''} />
        <Zeile l="Letzte Meta-Zahlung" v={dat(kz.meta_letzte_zahlung)} />
      </HKarte>

      <HKarte titel="Kampagnen" farbe={F.kampagne} wert={kz.kampagnen ? `${zahl(kz.kampagnen_aktiv) ?? 0} von ${zahl(kz.kampagnen)}` : null} leer="keine Kampagne zugeordnet"
        satz={kz.kampagnen ? <>aktiv · Tagesbudget {eur(kz.tagesbudget_aktiv) ?? '—'}</> : null} />

      <HKarte titel="Betreuung" farbe={F.betreuung} wert={zahl(kz.checkins)} leer="keine Check-ins"
        satz={kz.letzter_checkin ? <>Check-ins · letzter am {dat(kz.letzter_checkin)}{kz.tage_seit_checkin != null ? `, vor ${zahl(kz.tage_seit_checkin)} Tagen` : ''}</> : 'noch kein Check-in'} />

      <HKarte titel="Laufzeit" farbe={F.manuell} wert={kz.resttage == null ? null : kz.resttage < 0 ? `${zahl(-kz.resttage)} Tage über` : `${zahl(kz.resttage)} Tage`} leer="keine Laufzeit erfasst"
        satz={<>{dat(kz.startdatum) ?? '—'} – {dat(kz.enddatum) ?? '—'}{kz.monate_dabei != null ? ` · ${zahl(kz.monate_dabei)} Monate dabei` : ''}</>} />
    </div>
  );
}

/** Manual `clients` fields next to the computed value: computed wins when manual is empty/0, a differing manual value is shown with both sources. */
export function ManuellGepflegt({ client, kz }: { client: Record<string, any>; kz: Kennzahlen | null }) {
  const paare: { l: string; feld: string; berechnet: number | null | undefined; bl: string }[] = [
    { l: 'CLV', feld: 'clv', berechnet: kz?.abschlusswert, bl: 'Abschlusswert' },
    { l: 'Ads-Budget', feld: 'ads_budget', berechnet: kz?.werbebudget_eingezahlt, bl: 'Werbebudget eingezahlt' },
    { l: 'Cash Collect offen', feld: 'cash_collect_offen', berechnet: kz?.offen, bl: 'offen laut Rechnungen' },
    { l: 'Gesamt-Saldo', feld: 'gesamt_saldo', berechnet: undefined, bl: '' },
  ];
  return (
    <div className={KARTE}>
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted-foreground" />Manuell gepflegt</p>
      <p className="text-xs text-muted-foreground mt-2">Eingabefelder am Kundensatz, bearbeitbar über „Bearbeiten“. Ist ein Feld leer oder 0, steht hier der berechnete Wert.</p>
      <div className="mt-3 divide-y divide-border/50 text-sm tabular-nums">
        {paare.map(p => {
          const raw = client?.[p.feld];
          const manuell = raw == null || raw === '' || Number(raw) === 0 ? null : Number(raw);
          const ber = p.berechnet ?? null;
          let v: React.ReactNode;
          if (manuell == null && ber != null) v = <span>{eur(ber)} <span className="text-xs text-muted-foreground">berechnet ({p.bl})</span></span>;
          else if (manuell == null) v = <span className="text-muted-foreground">{p.bl ? 'nicht gepflegt, kein berechneter Wert' : 'nicht gepflegt'}</span>;
          else if (ber != null && Math.round(ber) !== Math.round(manuell)) v = <span className="flex flex-col items-end"><span>{eur(manuell)} <span className="text-xs text-muted-foreground">manuell</span></span><span className="text-xs text-warning-foreground dark:text-warning">weicht ab: berechnet {eur(ber)} ({p.bl})</span></span>;
          else v = <span>{eur(manuell)} <span className="text-xs text-muted-foreground">manuell</span></span>;
          return <div key={p.feld} className="flex justify-between gap-3 py-2"><span className="text-muted-foreground">{p.l}</span><span className="text-right">{v}</span></div>;
        })}
      </div>
    </div>
  );
}
