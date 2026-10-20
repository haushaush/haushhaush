import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { boundaries, callProgress, forecastPoints, monthClock, type Tier } from './presentation';

const n = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });
const weight = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const euro = (v: number) => `${n(v, 0)} €`;
export type Basis = { gesamt: number; heute_aktiv: number | null; abgegangen?: number; neu?: number; ohne_startdatum?: number; regel?: string };
type Props = { criterion: string; label: string; k: any; config: any; month: string; basis?: Basis; basisNeu?: Basis; onClick?: () => void; variant?: 'row' | 'detail' };

export function PerformanceTile({ criterion: key, label, k, config, month, basis, basisNeu, onClick, variant = 'detail' }: Props) {
  const w = k.wert || {};
  const clock = monthClock(month);
  const provisional = clock.current || clock.future;
  const cfg = config?.[key];
  const tiers: Tier[] = cfg?.staffel || [];
  const points = `${n(k.punkte)} von ${k.max} Punkten${provisional ? ' · vorläufig' : ''}`;
  let headline = 'Noch keine Daten', sub = '', outcome = points, next = '', pacing: { actual: number; target: number; unit: string } | null = null, forecast = '';
  let progress = 0, marks: number[] = [];
  if (key === 'calls') {
    const count = Number(w.anzahl_calls || 0), weighted = Number(w.gewichtete_summe || 0), target = Number(w.zielwert || 0);
    headline = `${count} Calls`;
    sub = count ? `gewichtet ${weight(weighted)} · ${w.eindeutige_kunden || 0} Kunden erreicht` : 'noch keine Calls in diesem Monat';
    const p = callProgress(weighted, target, k.punkte, tiers, cfg?.gewichtung_je_kunde_woche?.[0] ?? 1);
    outcome = `${target ? `${n(p.coverage)} % Abdeckung` : 'Zielzahl fehlt'} · ${points}`;
    next = !target ? 'Für die nächste Stufe fehlt die Monatsbasis.' : p.next ? `Nächste Stufe ab ${n(p.next.value)} % — dafür fehlen noch ${p.remaining ?? '–'} Calls mit vollem Gewicht.` : tiers.length ? 'Höchste Stufe erreicht.' : 'Staffel nicht verfügbar.';
    progress = p.coverage; marks = p.stages.map(t => t.value);
    if (clock.current && target > 0) {
      pacing = { actual: weighted, target: Math.round(target * clock.fraction), unit: 'gewichtet' };
      const rawProjection = Math.round(count / clock.fraction), weightedProjection = weighted / clock.fraction;
      const coverageProjection = weightedProjection / target * 100;
      forecast = `Bei diesem Tempo: ${rawProjection} Calls, ${n(coverageProjection)} % Abdeckung, ${n(Math.min(k.max, forecastPoints(tiers, coverageProjection)))} Punkte.`;
    }
  } else if (key === 'zufriedenheit') {
    headline = `${w.ausgefuellt || 0} Antworten`; sub = w.durchschnitt_score_betreuung != null ? `Ø ${n(w.durchschnitt_score_betreuung)} Betreuungsscore` : 'noch keine Antworten in diesem Monat';
    outcome = `${n(w.ausfuellquote || 0)} % Rücklauf · ${points}`;
    const needed = Math.max(0, Math.ceil((cfg?.ausfuellquote_schwelle || 0) / 100 * (w.betreute_kunden || 0)) - (w.ausgefuellt || 0));
    const stage = boundaries(tiers, 1).find(t => t.value > (w.durchschnitt_score_betreuung || 0) && t.points > k.punkte);
    next = needed > 0 ? `Für ${cfg?.ausfuellquote_schwelle ?? '–'} % Rücklauf fehlen noch ${needed} Antworten; Punkte hängen auch vom Betreuungsscore ab.` : stage ? `Nächste Score-Stufe ab Ø ${n(stage.value)}; Rücklauf muss mindestens ${cfg?.ausfuellquote_schwelle} % bleiben.` : 'Rücklaufziel erreicht; Bewertung nach Betreuungsscore.';
    progress = w.ausfuellquote || 0; marks = [cfg?.ausfuellquote_schwelle || 0];
    if (clock.current && w.betreute_kunden) { pacing = { actual: w.ausgefuellt || 0, target: Math.round(w.betreute_kunden * cfg.ausfuellquote_schwelle / 100 * clock.fraction), unit: 'Antworten' }; forecast = `Bei diesem Tempo: ${Math.round((w.ausgefuellt || 0) / clock.fraction)} Antworten. Punkte nicht belastbar prognostizierbar: künftige Bewertungen fehlen.`; }
  } else if (key === 'cash_niveau' || key === 'cash_entwicklung') {
    const amount = Number(w.summe_eur || 0);
    headline = w.summe_eur !== undefined ? euro(amount) : 'Noch keine Zahlungen';
    sub = key === 'cash_niveau' ? `${w.zugeordnet || 0} zugeordnete Zahlungseingänge` : `Referenz: ${w.vormonat_eur !== undefined ? euro(w.vormonat_eur) : 'noch nicht verfügbar'}${w.vergleich?.text ? ` · ${w.vergleich.text}` : ''}`;
    outcome = key === 'cash_entwicklung' ? `${w.veraenderung_prozent !== undefined ? `${n(w.veraenderung_prozent)} % Entwicklung` : 'Vergleich noch nicht verfügbar'} · ${points}` : points;
    const value = key === 'cash_niveau' ? amount : Number(w.veraenderung_prozent || 0);
    const stage = boundaries(tiers).find(t => t.value > value && t.points > k.punkte);
    next = stage ? `Nächste Stufe ab ${key === 'cash_niveau' ? euro(stage.value) : `${n(stage.value, 2)} %`} — noch ${euro(Math.max(0, key === 'cash_niveau' ? stage.value - amount : (w.vormonat_eur || 0) * (1 + stage.value / 100) - amount))} Zahlungseingang.` : tiers.length ? 'Höchste Stufe erreicht.' : 'Staffel nicht verfügbar.';
    const fullTarget = key === 'cash_niveau' ? stage?.value ?? boundaries(tiers).at(-1)?.value : w.vormonat_eur;
    progress = fullTarget > 0 ? amount / fullTarget * 100 : 0;
    // Reference already cut to the same day span: a pro-rata target would cut it twice.
    if (clock.current && fullTarget > 0 && w.summe_eur !== undefined && !(key === 'cash_entwicklung' && w.vergleich?.art === 'zeitgleich')) { pacing = { actual: amount, target: Math.round(fullTarget * clock.fraction), unit: '€' }; const projected = amount / clock.fraction; const v = key === 'cash_niveau' ? projected : (projected - w.vormonat_eur) / w.vormonat_eur * 100; forecast = `Bei diesem Tempo: ${euro(projected)}${key === 'cash_entwicklung' ? `, ${n(v)} % Entwicklung` : ''}, ${n(forecastPoints(tiers, v))} Punkte.`; }
  } else {
    headline = `${w.churn_ereignisse || 0} Abgänge`; sub = `${w.zaehlt_als_churn || 0} zählen als Churn`;
    outcome = `${n(w.churn_quote || 0)} % Churn · ${points}`;
    next = k.punkte === k.max ? 'Beste Stufe gehalten — keine bonusrelevanten Abgänge.' : 'Weniger Churn verbessert die Stufe; erfasste Abgänge sind keine aufzuholende Leistung.';
    progress = k.max ? k.punkte / k.max * 100 : 0;
    if (clock.current && w.betreute_kunden) { const limit = tiers.find(t => t.bis !== undefined && Number(t.bis) > 0)?.bis; forecast = `Kein Verlust-Soll. Anteilig bis heute: ${n((limit || 0) / 100 * w.betreute_kunden * clock.fraction)} Abgänge an der ${n(limit || 0)}-%-Grenze. Keine belastbare Churn-Prognose.`; }
  }
  const ratio = pacing && pacing.target > 0 ? pacing.actual / pacing.target : 1;
  const dotClass = ratio >= 1 ? 'bg-success' : ratio >= .8 ? 'bg-warning' : 'bg-destructive';
  const pct = Math.min(100, Math.max(0, progress));
  const bar = (
    <div className="relative h-1.5 rounded-full bg-muted" role="progressbar" aria-label={`${label}: Fortschritt`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      {marks.filter(m => m <= 100 && m > 0).map(m => <span key={m} title={`Stufe ab ${n(m)} %`} className="absolute top-[-4px] h-3.5 w-px bg-muted-foreground" style={{ left: `${Math.min(99.5, m)}%` }} />)}
    </div>
  );

  if (variant === 'row') {
    return (
      <button type="button" onClick={onClick} aria-label={`${label}: Details anzeigen`} className="glass-surface p-5 w-full min-w-0 text-left transition-colors hover:border-[hsl(var(--border-hover))] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="grid gap-x-6 gap-y-3 items-center sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="flex items-center gap-2 min-w-0">
            {pacing && <span aria-label={ratio >= 1 ? 'im Plan' : ratio >= .8 ? 'knapp dahinter' : 'deutlich dahinter'} className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />}
            <span className="text-sm font-semibold text-foreground">{label}</span>
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tabular-nums text-foreground break-words">{headline}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{outcome}</div>
          </div>
          {bar}
        </div>
      </button>
    );
  }

  return <div className="glass-surface p-5 min-w-0 space-y-4">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <div className="text-2xl font-semibold tabular-nums text-foreground break-words">{headline}</div>
      <p className="text-sm text-muted-foreground tabular-nums">{sub}</p>
    </div>
    <p className="text-sm text-muted-foreground tabular-nums">{outcome}</p>
    {bar}
    {k.status !== 'ok' && k.hinweis && <p className="text-sm text-muted-foreground">{k.hinweis}</p>}
    <p className="text-xs text-muted-foreground leading-relaxed">{next}</p>
    {pacing && <p className="text-xs text-muted-foreground tabular-nums flex gap-2 items-start"><span aria-hidden className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} /><span>{key === 'calls' && Number(w.gewichtete_summe) === Number(w.anzahl_calls) ? `${w.anzahl_calls} von ${n(pacing.target, 0)} Calls` : `${n(pacing.actual)} von ${n(pacing.target, 0)} ${pacing.unit}`} im Zeitplan · {ratio >= 1 ? 'im Plan' : ratio >= .8 ? 'knapp dahinter' : 'deutlich dahinter'}{key === 'cash_niveau' ? ' · Soll zur nächsten Stufe' : key === 'cash_entwicklung' ? ' · Soll zum Referenzmonat' : ''}</span></p>}
    {forecast && <p className="text-xs text-muted-foreground leading-relaxed tabular-nums"><span className="font-medium">{key === 'churn' ? 'Einordnung' : 'Prognose'}: </span>{forecast}</p>}
    <div className="pt-2 space-y-1">
      {(w.zielwert !== undefined || w.betreute_kunden !== undefined) && <div className="flex items-center gap-1 text-xs text-muted-foreground">{key === 'calls' ? 'Zielzahl' : 'Monatsbasis'}: {w.zielwert ?? w.betreute_kunden}<Tooltip><TooltipTrigger asChild><button type="button" className="glass-btn-ghost inline-flex h-6 w-6 items-center justify-center" aria-label="Monatsbasis erklären"><Info className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-80 font-normal">{basis?.regel === 'aktiv_im_monat' ? `Basis: Kunden, die im ${new Date(month).toLocaleDateString('de-DE', { month: 'long' })} mindestens einen Tag aktiv waren. ${basis.gesamt} Kunden · davon ${basis.abgegangen ?? 0} abgegangen · ${basis.neu ?? 0} neu dazugekommen.` : <>Basis: {basis?.gesamt ?? w.zielwert ?? w.betreute_kunden} Kunden im {new Date(month).toLocaleDateString('de-DE', { month: 'long' })} (gespeicherter Stand).</>}{basisNeu && ` Nach neuer Regel wären es ${basisNeu.gesamt} Kunden — der freigegebene Monat bleibt unverändert.`}</TooltipContent></Tooltip>{basisNeu && basisNeu.gesamt !== (basis?.gesamt ?? w.zielwert) && <span className="text-muted-foreground/70">· neue Regel: {basisNeu.gesamt}</span>}</div>}
      {k.basis_hinweis && <p className="text-xs text-muted-foreground">{k.basis_hinweis}</p>}
    </div>
  </div>;
}