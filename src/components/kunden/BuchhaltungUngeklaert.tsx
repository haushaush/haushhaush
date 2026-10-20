import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { alle, KEIN_BEDARF } from '@/lib/kundenVerknuepfungen';
import { QuickZeile, ZahlungPanel } from './QuickMatch';

type Row = { client_id: string; client_name: string | null; marke: string | null; grund: string };

/** Kunden ohne eindeutige Buchhaltungsquelle (keine oder beide Zahlungsverknüpfungen); Grund je Zeile, Zuordnung inline. */
export function BuchhaltungUngeklaert() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kein, setKein] = useState<Set<string>>(new Set());
  const [vn, setVn] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    (supabase.rpc as any)('buchhaltung_quelle_ungeklaert').then(({ data, error }: any) => { if (error) console.error('Buchhaltungsquelle:', error); setRows(data || []); });
    alle('kunde_link_vorschlag_verworfen', 'client_id, system', q => q.eq('externe_id', KEIN_BEDARF)).then(r => setKein(new Set(r.rows.map(x => `${x.system}|${x.client_id}`))));
    alle('clients', 'id, vor_nachname', q => q.is('deleted_at', null)).then(r => setVn(new Map(r.rows.map(x => [x.id, x.vor_nachname]))));
  }, []);
  if (!rows) return null;
  const rs = rows.filter(r => !kein.has(`buchhaltung|${r.client_id}`));
  return (
    <section className="rounded-2xl bg-card shadow-sm px-5 py-3">
      <div className="flex items-center gap-3"><span className="text-sm font-medium">Buchhaltungsquelle ungeklärt</span><span className="ml-auto text-sm tabular-nums text-muted-foreground">{rs.length}</span></div>
      {rs.length === 0 ? <p className="text-sm text-muted-foreground pt-1">nichts offen</p> : (
        <div className="divide-y divide-border/50 pt-1">
          {rs.map(r => (
            <QuickZeile key={r.client_id} clientId={r.client_id} titel={r.client_name || '—'} info={r.grund}
              panel={fertig => <ZahlungPanel kunde={{ id: r.client_id, name: r.client_name, vor_nachname: vn.get(r.client_id) }} fertig={fertig} />} />
          ))}
        </div>
      )}
    </section>
  );
}
