import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Row = { client_id: string; client_name: string | null; marke: string | null; grund: string };
const REIHENFOLGE = ['Buchhaltungsquelle ungeklärt', 'Keine Marke in Close', 'Kein Close-Lead verknüpft'];

/** Kunden ohne eindeutige Buchhaltungsquelle, je Grund ein Abschnitt mit Anzahl. Hinweise – gepflegt wird in Close. Nie geraten. */
export function BuchhaltungUngeklaert() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    (supabase.rpc as any)('buchhaltung_quelle_ungeklaert').then(({ data }: any) => setRows(data || []));
  }, []);
  if (!rows) return null;
  const gruppen = new Map<string, Row[]>();
  for (const r of rows) { const g = r.grund || 'Buchhaltungsquelle ungeklärt'; (gruppen.get(g) || gruppen.set(g, []).get(g)!).push(r); }
  const titel = [...new Set([...REIHENFOLGE, ...gruppen.keys()])];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">Hinweise – diese Punkte werden in Close gepflegt, nicht hier. Bis dahin bleibt der Zahlungsstatus leer.</p>
      {titel.map(t => {
        const rs = gruppen.get(t) || [];
        return (
          <section key={t} className="rounded-2xl bg-card/60 border border-border/50 px-5 py-3">
            <div className="flex items-center gap-3"><span className="text-sm font-medium">{t}</span><span className="ml-auto text-sm tabular-nums text-muted-foreground">{rs.length}</span></div>
            {rs.length === 0 ? <p className="text-sm text-muted-foreground pt-1">nichts offen</p> : (
              <div className="divide-y divide-border/50 pt-1">
                {rs.map(r => (
                  <Link key={r.client_id} to={`/kunden/${r.client_id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary">
                    <span className="truncate">{r.client_name || '—'}</span>
                    {r.marke && <span className="text-xs text-muted-foreground shrink-0">„{r.marke}“</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
