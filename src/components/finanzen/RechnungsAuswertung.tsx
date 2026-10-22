import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { ladeRechnungen, type Quelle } from '@/lib/rechnungen';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend, CartesianGrid } from 'recharts';
import { HealthKarte, FARBE } from './HealthKarte';

/**
 * Rechnungs-Auswertung aus den gespiegelten Rechnungstabellen (Qonto, lexoffice).
 * Nur Rechnungsdaten — keine Bank-Kennzahlen. Bei mehreren Quellen werden Beträge je Kennzahl addiert.
 */
type Row = { quelle: Quelle; status: 'paid' | 'open'; amount: number; issue: string | null; due: string | null; paid: string | null; sonstige?: boolean; ueber?: boolean };

const LABEL: Record<Quelle, string> = { qonto: 'Qonto', lexoffice: 'lexoffice' };
const BUCKETS = ['0-7', '8-14', '15-30', '31-60', '60+'];
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (n: number | null) => (n == null ? '–' : `${(n * 100).toFixed(1).replace('.', ',')} %`);
const tooltipStyle = { borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 };

async function lade(q: Quelle): Promise<Row[]> {
  const rows = await ladeRechnungen(q);
  return rows.filter(r => r.status !== 'storniert').map(r => ({
    quelle: q, status: r.status === 'bezahlt' ? 'paid' : 'open', amount: r.amount,
    issue: r.issue, due: r.due, paid: r.paid, sonstige: r.status === 'sonstige', ueber: r.status === 'überfällig',
  }));
}

function Kachel({ title, value, sub, hint }: { title: string; value: string; sub?: string; hint?: string }) {
  return (
    <Card><CardContent className="p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
      {hint && <p className="text-xs text-warning">{hint}</p>}
    </CardContent></Card>
  );
}

export function RechnungsAuswertung({ quellen, quelleText, nurZusatz = false, verlaufHinweis }: { quellen: Quelle[]; quelleText: string; nurZusatz?: boolean; verlaufHinweis?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const key = quellen.join(',');

  useEffect(() => {
    setRows(null); setFehler(null);
    Promise.all(quellen.map(lade)).then(r => setRows(r.flat())).catch(e => setFehler(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const m = useMemo(() => {
    if (!rows) return null;
    const heute = new Date().toISOString().slice(0, 10);
    const tage = (d: string) => Math.floor((Date.parse(heute) - Date.parse(d)) / 86400000);
    const sonst = rows.filter(r => r.sonstige);
    const zaehlbar = rows.filter(r => !r.sonstige);
    const paid = zaehlbar.filter(r => r.status === 'paid');
    const open = zaehlbar.filter(r => r.status === 'open');
    const overdue = open.filter(r => r.ueber);
    const sum = (a: Row[]) => a.reduce((s, r) => s + r.amount, 0);
    const issuedSum = sum(zaehlbar);
    const fehlend = quellen.filter(q => !rows.some(r => r.quelle === q));
    const aging = BUCKETS.map(b => ({ bucket: b, count: 0, total: 0 }));
    open.forEach(r => {
      const d = r.due && r.due < heute ? tage(r.due) : 0;
      const i = d <= 7 ? 0 : d <= 14 ? 1 : d <= 30 ? 2 : d <= 60 ? 3 : 4;
      aging[i].count++; aging[i].total += r.amount;
    });
    const now = new Date();
    const monate = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const monthly = monate.map(k => ({
      month: k,
      ausgestellt: sum(rows.filter(r => r.issue?.startsWith(k))),
      bezahlt: sum(paid.filter(r => r.paid?.startsWith(k))),
    }));
    return {
      count: rows.length, sonstigeCount: sonst.length, paidCount: paid.length, openCount: open.length, overdueCount: overdue.length,
      paidSum: sum(paid), openSum: sum(open), overdueSum: sum(overdue),
      rate: issuedSum > 0 ? sum(paid) / issuedSum : null,
      largest: open.reduce((mx, r) => Math.max(mx, r.amount), 0),
      aging, monthly, fehlend,
    };
  }, [rows, key]);

  if (fehler) return <p className="text-sm text-destructive">Rechnungen konnten nicht geladen werden: {fehler}</p>;
  if (!m) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const hint = m.fehlend.length ? `${m.fehlend.map(q => LABEL[q]).join(', ')} noch nicht synchronisiert` : undefined;
  if (m.count === 0) {
    return <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">Noch keine Rechnungen aus {quelleText} synchronisiert.</CardContent></Card>;
  }

  const zusammen = quellen.includes('qonto') && quellen.includes('lexoffice');
  const verlaufText = zusammen
    ? 'Ausgestellt nach Rechnungsdatum · bezahlt nach Zahldatum, daher nur Qonto — lexoffice liefert kein Zahldatum'
    : 'Ausgestellt nach Rechnungsdatum, bezahlt nach Zahldatum';
  const achse = { stroke: 'hsl(var(--muted-foreground))', fontSize: 11, tickLine: false, axisLine: false } as const;
  const bucketFarbe = (b: string) => (b === '60+' ? FARBE.rot : b === '31-60' ? 'hsl(var(--warning))' : FARBE.gruen);
  const alt = m.aging[4];

  return (
    <div className="space-y-8">
      {nurZusatz ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <HealthKarte titel="Größte offene Forderung" farbe={FARBE.rot} wert={m.openCount ? eur(m.largest) : 'keine offenen'} satz={hint} />
        </div>
      ) : (
      <div>
        <div className="mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">C · Rechnungen & Cash Collected</h3>
          <p className="text-xs text-muted-foreground">{quelleText} · alle Rechnungen ohne stornierte</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <HealthKarte titel="Rechnungen gesamt" farbe={FARBE.primaer} wert={m.count.toLocaleString('de-DE')} satz={<>{m.sonstigeCount ? `davon ${m.sonstigeCount.toLocaleString('de-DE')} sonstige (Status unbekannt)` : null}{hint && <span className="block text-warning">{hint}</span>}</>} />
          <HealthKarte titel="Bezahlt" farbe={FARBE.gruen} wert={eur(m.paidSum)} satz={<>{`${m.paidCount.toLocaleString('de-DE')} Stück`}{hint && <span className="block text-warning">{hint}</span>}</>} />
          <HealthKarte titel="Offen" farbe="hsl(var(--warning))" wert={eur(m.openSum)} satz={<>{`${m.openCount.toLocaleString('de-DE')} Stück`}{hint && <span className="block text-warning">{hint}</span>}</>} />
          <HealthKarte titel="Überfällig" farbe={FARBE.rot} wert={eur(m.overdueSum)} satz={<>{`${m.overdueCount.toLocaleString('de-DE')} Stück`}{hint && <span className="block text-warning">{hint}</span>}</>} />
          <HealthKarte titel="Collection Rate" farbe={FARBE.grau} wert={pct(m.rate)} satz={<>bezahlt ÷ ausgestellt{hint && <span className="block text-warning">{hint}</span>}</>} />
          <HealthKarte titel="Größte offene Forderung" farbe={FARBE.rot} wert={m.openCount ? eur(m.largest) : 'keine offenen'} satz={hint && <span className="text-warning">{hint}</span>} />
        </div>
      </div>
      )}

      <HealthKarte titel="Monatsentwicklung (letzte 12 Monate)" farbe={FARBE.primaer}
        satz={`${verlaufText}${hint ? ` · ${hint}` : ''}${verlaufHinweis ? ` · ${verlaufHinweis}` : ''}`}>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m.monthly}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="month" {...achse} />
              <YAxis {...achse} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ausgestellt" name="Ausgestellt" fill="hsl(var(--muted-foreground))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="bezahlt" name="Bezahlt" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </HealthKarte>

      <HealthKarte titel="H · Forderungsalter" farbe={FARBE.rot}
        satz={`Tage nach Fälligkeit, offene Rechnungen${hint ? ` · ${hint}` : ''}`}>
        {m.openCount === 0 ? <p className="text-xs text-muted-foreground py-6 text-center">Keine offenen Forderungen.</p> : (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={m.aging}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="bucket" {...achse} />
                <YAxis {...achse} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur(Number(v))} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {m.aging.map((a, i) => <Cell key={i} fill={bucketFarbe(a.bucket)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {alt.count > 0 && (
              <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                <span className="font-semibold text-destructive">{eur(alt.total)}</span> in 60+ Tagen überfällig — {alt.count.toLocaleString('de-DE')} von {m.openCount.toLocaleString('de-DE')} offenen Rechnungen
              </p>
            )}
            <div className="grid grid-cols-5 gap-2 mt-4">
              {m.aging.map(a => {
                const gross = a.bucket === '60+';
                return (
                  <div key={a.bucket} className={`rounded-2xl p-2 sm:p-3 text-center ${gross ? 'bg-destructive/10 ring-1 ring-destructive/30' : 'bg-muted/50'}`}>
                    <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: bucketFarbe(a.bucket) }} />{a.bucket}T
                    </p>
                    <p className={`mt-1 tabular-nums ${gross ? 'text-base font-semibold' : 'text-sm font-medium'}`}>{a.count ? eur(a.total) : '–'}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{a.count ? `${a.count} Stück` : ''}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </HealthKarte>
    </div>
  );
}
