import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { HealthKarte, HEALTH_KARTE, FARBE } from './HealthKarte';

type Konto = {
  meta_account_id: string; kontoname: string | null; art: 'untermarke' | 'kunde_eigen' | 'unbekannt' | string;
  kunden: number | null; kunden_mit_zahlung: number | null; eingezahlt: number | null; ausgegeben: number | null;
  differenz: number | null; differenz_betrag: number | null; letzte_aufladung: string | null; letzte_meta_zahlung: string | null;
  belege: number | null; kampagnen_aktiv: number | null; tagesbudget: number | null;
};
type Filter = 'alle' | 'unterdeckt' | 'untermarken';

const GRENZE = 500;
const eur = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const datum = (s: string | null) => s ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const norm = (id: string | null | undefined) => String(id || '').replace(/^act_/, '');
const ART: Record<string, string> = { untermarke: 'Untermarke', kunde_eigen: 'Kundeneigenes Konto', unbekannt: 'Art unbekannt' };

function diffKlasse(d: number | null) {
  if (d == null || Math.abs(d) <= GRENZE) return 'text-muted-foreground';
  return d < 0 ? 'text-destructive' : 'text-success';
}

/** Werbebudget je Meta-Konto aus der View untermarke_werbebudget, sortiert nach Differenzbetrag. Nur lesend. */
export function UntermarkenKonten() {
  const [konten, setKonten] = useState<Konto[]>([]);
  const [kundenJeKonto, setKundenJeKonto] = useState<Map<string, { id: string; name: string; eingezahlt: number | null }[]>>(new Map());
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');
  const [offen, setOffen] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [v, z, k, e, c] = await Promise.all([
        (supabase.from as any)('untermarke_werbebudget').select('*'),
        (supabase.from as any)('werbebudget_zuordnung').select('client_id, meta_account_id'),
        (supabase.from as any)('kunde_meta_accounts').select('client_id, meta_account_id'),
        (supabase.from as any)('werbebudget_eingezahlt').select('client_id, eingezahlt_netto, eingezahlt_gesamt_netto'),
        supabase.from('clients').select('id, name').is('deleted_at', null),
      ]);
      if (v.error) { console.error('untermarke_werbebudget', v.error.message); setFehler(v.error.message); }
      const namen = new Map<string, string>(((c.data || []) as any[]).map(x => [x.id, x.name]));
      const ein = new Map<string, number | null>(((e.data || []) as any[]).map(x => [x.client_id, x.eingezahlt_gesamt_netto ?? x.eingezahlt_netto ?? null]));
      const m = new Map<string, Set<string>>();
      [...((z.data || []) as any[]), ...((k.data || []) as any[])].forEach(r => {
        if (!r.client_id || !r.meta_account_id) return;
        const key = norm(r.meta_account_id);
        m.set(key, (m.get(key) || new Set()).add(r.client_id));
      });
      const out = new Map<string, { id: string; name: string; eingezahlt: number | null }[]>();
      m.forEach((ids, key) => out.set(key, [...ids].map(id => ({ id, name: namen.get(id) || 'Unbekannter Kunde', eingezahlt: ein.has(id) ? ein.get(id)! : null }))
        .sort((a, b) => Number(b.eingezahlt || 0) - Number(a.eingezahlt || 0) || a.name.localeCompare(b.name))));
      setKonten((v.data || []) as Konto[]);
      setKundenJeKonto(out);
      setLaedt(false);
    })();
  }, []);

  const summe = useMemo(() => {
    const s = (f: (k: Konto) => number | null) => konten.reduce((acc, k) => acc + Number(f(k) || 0), 0);
    const unter = konten.filter(k => k.differenz != null && Number(k.differenz) < -GRENZE).length;
    const guthaben = konten.filter(k => k.differenz != null && Number(k.differenz) > GRENZE).length;
    return { ein: s(k => k.eingezahlt), aus: s(k => k.ausgegeben), diff: s(k => k.differenz), unter, guthaben, ausgeglichen: konten.length - unter - guthaben };
  }, [konten]);

  const liste = useMemo(() => konten
    .filter(k => filter === 'alle' || (filter === 'unterdeckt' ? k.differenz != null && Number(k.differenz) < -GRENZE : k.art === 'untermarke'))
    .sort((a, b) => Number(b.differenz_betrag || 0) - Number(a.differenz_betrag || 0)), [konten, filter]);

  if (laedt) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HealthKarte titel="Eingezahlt gesamt" farbe={FARBE.primaer} wert={eur(summe.ein)} satz="Werbebudget-Zahlungen aller Kunden über alle Meta-Konten." />
        <HealthKarte titel="Bei Meta ausgegeben gesamt" farbe={FARBE.grau} wert={eur(summe.aus)} satz="Was auf den Konten tatsächlich an Meta gezahlt wurde." />
        <HealthKarte titel="Differenz" farbe={summe.diff < -GRENZE ? FARBE.rot : summe.diff > GRENZE ? FARBE.gruen : FARBE.grau} wert={eur(summe.diff)}
          satz={summe.diff < 0 ? 'Wir haben mehr bei Meta ausgegeben, als eingezahlt wurde.' : 'Eingezahlt minus ausgegeben; positiv heißt Guthaben.'} />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {summe.unter} Konten unterdeckt · {summe.guthaben} Konten mit Guthaben · {summe.ausgeglichen} ausgeglichen
        {fehler && <span className="text-destructive"> · Fehler beim Laden: {fehler}</span>}
      </p>

      <div className={HEALTH_KARTE}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-primary"><span className="h-2 w-2 rounded-full bg-primary" />Meta-Konten</p>
          <div className="flex gap-2" role="group" aria-label="Filter">
            {([['alle', 'Alle'], ['unterdeckt', 'Nur unterdeckte'], ['untermarken', 'Nur Untermarken']] as [Filter, string][]).map(([w, t]) => (
              <button key={w} type="button" onClick={() => setFilter(w)} aria-pressed={filter === w}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${filter === w ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:bg-muted/50'}`}>{t}</button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Größte Abweichung oben. Negativ heißt: mehr bei Meta ausgegeben als eingezahlt.</p>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[minmax(220px,2fr)_repeat(3,minmax(110px,1fr))_minmax(150px,1fr)] gap-3 px-2 pb-2 text-xs text-muted-foreground border-b">
              <span>Konto</span><span className="text-right">Eingezahlt</span><span className="text-right">Ausgegeben</span><span className="text-right">Differenz</span><span className="text-right">Kampagnen · Tagesbudget</span>
            </div>
            {liste.map(k => {
              const key = norm(k.meta_account_id);
              const ist = offen.has(key);
              const kunden = kundenJeKonto.get(key) || [];
              const d = k.differenz != null ? Number(k.differenz) : null;
              return (
                <div key={k.meta_account_id} className="border-b last:border-b-0">
                  <button type="button" aria-expanded={ist}
                    onClick={() => setOffen(p => { const n = new Set(p); ist ? n.delete(key) : n.add(key); return n; })}
                    className="w-full grid grid-cols-[minmax(220px,2fr)_repeat(3,minmax(110px,1fr))_minmax(150px,1fr)] gap-3 px-2 py-3 text-left hover:bg-muted/30 rounded-xl">
                    <span className="min-w-0 flex gap-1.5">
                      {ist ? <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                      <span className="min-w-0">
                        <span className="block font-medium truncate" title={k.kontoname || k.meta_account_id}>{k.kontoname || k.meta_account_id}</span>
                        <span className="block text-xs text-muted-foreground">{ART[k.art] || 'Art unbekannt'} · {Number(k.kunden || 0)} Kunden{k.kunden_mit_zahlung != null ? ` · ${k.kunden_mit_zahlung} mit Zahlung` : ''}</span>
                      </span>
                    </span>
                    <span className="text-right tabular-nums">{eur(k.eingezahlt)}<span className="block text-xs text-muted-foreground">zuletzt {datum(k.letzte_aufladung)}</span></span>
                    <span className="text-right tabular-nums">{eur(k.ausgegeben)}<span className="block text-xs text-muted-foreground">zuletzt {datum(k.letzte_meta_zahlung)}{k.belege != null ? ` · ${k.belege} Belege` : ''}</span></span>
                    <span className={`text-right tabular-nums font-medium ${diffKlasse(d)}`}>{eur(d)}</span>
                    <span className="text-right tabular-nums">{k.kampagnen_aktiv != null ? `${k.kampagnen_aktiv} aktiv` : '—'}<span className="block text-xs text-muted-foreground">{k.tagesbudget != null ? `${eur(k.tagesbudget)} / Tag` : 'kein Tagesbudget'}</span></span>
                  </button>
                  {ist && (
                    <div className="ml-8 mb-3 rounded-2xl bg-muted/30 p-3">
                      {kunden.length === 0 ? <p className="text-xs text-muted-foreground">Keine Kunden mit diesem Konto verknüpft.</p> : (
                        <ul className="divide-y">
                          {kunden.map(c => (
                            <li key={c.id} className="flex justify-between gap-3 py-1.5 text-sm">
                              <span className="truncate">{c.name}</span>
                              <span className="tabular-nums">{c.eingezahlt != null ? eur(c.eingezahlt) : <span className="text-muted-foreground text-xs">keine Werbebudget-Zahlung</span>}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {liste.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Keine Konten für diesen Filter.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
