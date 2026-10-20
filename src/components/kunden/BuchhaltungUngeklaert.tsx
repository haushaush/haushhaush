import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { alle, KEIN_BEDARF } from '@/lib/kundenVerknuepfungen';
import { ClosePanel, MarkePanel, QuellePanel, QuickZeile } from './QuickMatch';

type Row = { client_id: string; client_name: string | null; marke: string | null; grund: string };
const REIHENFOLGE = ['Buchhaltungsquelle ungeklärt', 'Keine Marke in Close', 'Kein Close-Lead verknüpft'];
const SYS: Record<string, string> = { 'Buchhaltungsquelle ungeklärt': 'buchhaltung', 'Keine Marke in Close': 'marke', 'Kein Close-Lead verknüpft': 'close' };

/** Kunden ohne eindeutige Buchhaltungsquelle, je Grund ein Abschnitt mit Anzahl und Schnellzuordnung je Zeile. */
export function BuchhaltungUngeklaert({ onCloseVerknuepft }: { onCloseVerknuepft?: (clientId: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kein, setKein] = useState<Set<string>>(new Set());
  const [vn, setVn] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    (supabase.rpc as any)('buchhaltung_quelle_ungeklaert').then(({ data, error }: any) => { if (error) console.error('Buchhaltungsquelle:', error); setRows(data || []); });
    alle('kunde_link_vorschlag_verworfen', 'client_id, system', q => q.eq('externe_id', KEIN_BEDARF)).then(r => setKein(new Set(r.rows.map(x => `${x.system}|${x.client_id}`))));
    alle('clients', 'id, vor_nachname', q => q.is('deleted_at', null)).then(r => setVn(new Map(r.rows.map(x => [x.id, x.vor_nachname]))));
  }, []);
  if (!rows) return null;
  const gruppen = new Map<string, Row[]>();
  for (const r of rows) {
    const g = !r.grund || r.grund === 'Unbekannte Marke' ? 'Buchhaltungsquelle ungeklärt' : r.grund;
    if (kein.has(`${SYS[g]}|${r.client_id}`)) continue;
    (gruppen.get(g) || gruppen.set(g, []).get(g)!).push(r);
  }
  const titel = [...new Set([...REIHENFOLGE, ...gruppen.keys()])];
  return (
    <div className="space-y-3">
      {titel.map(t => {
        const rs = gruppen.get(t) || [];
        return (
          <section key={t} className="rounded-2xl bg-card shadow-sm px-5 py-3">
            <div className="flex items-center gap-3"><span className="text-sm font-medium">{t}</span><span className="ml-auto text-sm tabular-nums text-muted-foreground">{rs.length}</span></div>
            {rs.length === 0 ? <p className="text-sm text-muted-foreground pt-1">nichts offen</p> : (
              <div className="divide-y divide-border/50 pt-1">
                {rs.map(r => (
                  <QuickZeile key={r.client_id} clientId={r.client_id} titel={r.client_name || '—'}
                    info={t === 'Buchhaltungsquelle ungeklärt' && r.marke ? `Marke „${r.marke}" ohne Buchhaltungsquelle` : undefined}
                    panel={fertig => t === 'Kein Close-Lead verknüpft'
                      ? <ClosePanel clientId={r.client_id} namen={[r.client_name, vn.get(r.client_id)]} fertig={e => { fertig(e); onCloseVerknuepft?.(r.client_id); }} />
                      : t === 'Keine Marke in Close' ? <MarkePanel clientId={r.client_id} fertig={fertig} />
                      : <QuellePanel clientId={r.client_id} marke={r.marke} fertig={fertig} />} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
