import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ladeRechnungen, type Quelle, type Rechnung } from '@/lib/rechnungen';

/**
 * Sechs gemeinsame Rechnungskennzahlen für Lexware und Qonto – gleiche Reihenfolge, Bezeichnung und Optik.
 * Statuszuordnung kommt ausschließlich aus src/lib/rechnungen.ts (lexoffice: „bezahlt" aus status, nicht aus paid_date).
 * Stornierte und Rechnungen mit unbekanntem Status zählen nicht mit und werden darunter genannt.
 */
const KARTE = 'rounded-3xl bg-card p-6 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)]';
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const stk = (n: number) => `${n.toLocaleString('de-DE')} Stück`;

function Karte({ name, punkt, wert, satz, hinweis }: { name: string; punkt: string; wert: string; satz: string; hinweis?: string }) {
  return (
    <div className={KARTE}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${punkt}`} />
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{name}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{wert}</p>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">{satz}</p>
      {hinweis && <p className="mt-2 text-xs text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

export function GemeinsameKennzahlen({ quelle, from, to }: { quelle: Quelle; from: string | null; to: string | null }) {
  const [rows, setRows] = useState<Rechnung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setRows(null); setFehler(null);
    ladeRechnungen(quelle).then(setRows).catch(e => setFehler(e?.message || String(e)));
  }, [quelle]);

  const m = useMemo(() => {
    if (!rows) return null;
    const imZeitraum = rows.filter(r => (!from || (r.issue && r.issue >= from)) && (!to || (r.issue && r.issue <= to)));
    const sum = (a: Rechnung[]) => a.reduce((s, r) => s + r.amount, 0);
    const storniert = imZeitraum.filter(r => r.status === 'storniert');
    const sonstige = imZeitraum.filter(r => r.status === 'sonstige');
    const zaehlbar = imZeitraum.filter(r => r.status !== 'storniert' && r.status !== 'sonstige');
    const bezahlt = zaehlbar.filter(r => r.status === 'bezahlt');
    const offen = zaehlbar.filter(r => r.status === 'offen' || r.status === 'überfällig');
    const ueber = zaehlbar.filter(r => r.status === 'überfällig');
    const fakturiert = sum(zaehlbar);
    return {
      anzahl: zaehlbar.length, fakturiert, bezahlt: sum(bezahlt), bezahltN: bezahlt.length,
      offen: sum(offen), offenN: offen.length, ueber: sum(ueber), ueberN: ueber.length,
      rate: fakturiert > 0 ? sum(bezahlt) / fakturiert : null,
      stornoN: storniert.length, storno: sum(storniert),
      sonstigeN: sonstige.length, sonstigeRaw: [...new Set(sonstige.map(r => r.rawStatus || '–'))].join(', '),
    };
  }, [rows, from, to]);

  if (fehler) return <p className="text-sm text-destructive">Rechnungen konnten nicht geladen werden: {fehler}</p>;
  if (!m) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const rate = m.rate == null ? '–' : `${(m.rate * 100).toFixed(1).replace('.', ',')} %`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Karte name="Rechnungen gesamt" punkt="bg-primary" wert={m.anzahl.toLocaleString('de-DE')} satz="Anzahl, ohne stornierte" />
        <Karte name="Fakturiert" punkt="bg-primary" wert={eur(m.fakturiert)} satz={stk(m.anzahl)} />
        <Karte name="Bezahlt" punkt="bg-success" wert={eur(m.bezahlt)} satz={stk(m.bezahltN)} />
        <Karte name="Offen" punkt="bg-warning" wert={eur(m.offen)} satz={stk(m.offenN)} />
        <Karte name="Überfällig" punkt="bg-destructive" wert={eur(m.ueber)} satz={stk(m.ueberN)}
          hinweis={quelle === 'lexoffice' ? "lexoffice kennt keinen Status ‚offen, aber noch nicht fällig‘ — jede unbezahlte Rechnung gilt hier als überfällig." : undefined} />
        <Karte name="Collection Rate" punkt="bg-muted-foreground" wert={rate} satz="bezahlt ÷ fakturiert" />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {m.stornoN.toLocaleString('de-DE')} stornierte Rechnungen über {eur(m.storno)} nicht mitgezählt.
        {m.sonstigeN > 0 && ` Außerdem ${m.sonstigeN.toLocaleString('de-DE')} Rechnung${m.sonstigeN === 1 ? '' : 'en'} mit Status „${m.sonstigeRaw}" nicht mitgezählt.`}
      </p>
    </div>
  );
}
