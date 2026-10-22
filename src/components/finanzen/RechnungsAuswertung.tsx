import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { ladeRechnungen, type Quelle } from '@/lib/rechnungen';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend } from 'recharts';

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

  return (
    <div className="space-y-6">
      {nurZusatz ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kachel title="Größte offene Forderung" value={m.openCount ? eur(m.largest) : 'keine offenen'} hint={hint} />
        </div>
      ) : (
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">C · Rechnungen & Cash Collected</h3>
          <p className="text-xs text-muted-foreground">{quelleText} · alle Rechnungen ohne stornierte</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3">
          <Kachel title="Rechnungen gesamt" value={m.count.toLocaleString('de-DE')} sub={m.sonstigeCount ? `davon ${m.sonstigeCount.toLocaleString('de-DE')} sonstige (Status unbekannt)` : undefined} hint={hint} />
          <Kachel title="Bezahlt" value={eur(m.paidSum)} sub={`${m.paidCount.toLocaleString('de-DE')} Stück`} hint={hint} />
          <Kachel title="Offen" value={eur(m.openSum)} sub={`${m.openCount.toLocaleString('de-DE')} Stück`} hint={hint} />
          <Kachel title="Überfällig" value={eur(m.overdueSum)} sub={`${m.overdueCount.toLocaleString('de-DE')} Stück`} hint={hint} />
          <Kachel title="Collection Rate" value={pct(m.rate)} sub="bezahlt ÷ ausgestellt" hint={hint} />
          <Kachel title="Größte offene Forderung" value={m.openCount ? eur(m.largest) : 'keine offenen'} hint={hint} />
        </div>
      </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monatsentwicklung (letzte 12 Monate)</CardTitle>
          <p className="text-xs text-muted-foreground">Ausgestellt nach Rechnungsdatum, bezahlt nach Zahldatum{hint ? ` · ${hint}` : ''}{verlaufHinweis ? ` · ${verlaufHinweis}` : ''}</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m.monthly}>
              <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} />
              <YAxis stroke="#AEAEB2" fontSize={11} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ausgestellt" name="Ausgestellt" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="bezahlt" name="Bezahlt" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">H · Forderungsalter</CardTitle>
          <p className="text-xs text-muted-foreground">Tage nach Fälligkeit, offene Rechnungen{hint ? ` · ${hint}` : ''}</p>
        </CardHeader>
        <CardContent>
          {m.openCount === 0 ? <p className="text-xs text-muted-foreground py-6 text-center">Keine offenen Forderungen.</p> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={m.aging}>
                  <XAxis dataKey="bucket" stroke="#AEAEB2" fontSize={11} />
                  <YAxis stroke="#AEAEB2" fontSize={11} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur(Number(v))} />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {m.aging.map((a, i) => <Cell key={i} fill={a.bucket === '60+' ? '#dc2626' : a.bucket === '31-60' ? '#f59e0b' : 'hsl(174, 90%, 31%)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-5 gap-1 mt-2 text-xs text-center tabular-nums">
                {m.aging.map(a => (
                  <div key={a.bucket}>
                    <p className="text-muted-foreground">{a.bucket}T</p>
                    <p className="font-medium">{a.count ? eur(a.total) : '–'}</p>
                    <p className="text-muted-foreground">{a.count ? `${a.count} Stück` : ''}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
