import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Kunden ohne eindeutige Buchhaltungsquelle (Close-Marke fehlt oder ist unbekannt). Nie geraten. */
export function BuchhaltungUngeklaert() {
  const [rows, setRows] = useState<{ client_id: string; client_name: string | null; marke: string | null; grund: string }[] | null>(null);
  useEffect(() => {
    (supabase.rpc as any)('buchhaltung_quelle_ungeklaert').then(({ data }: any) => setRows(data || []));
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Buchhaltungsquelle ungeklärt</CardTitle>
        <p className="text-xs text-muted-foreground">Für diese Kunden bleibt der Zahlungsstatus leer, bis die Marke in Close gesetzt ist.</p>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {rows.map(r => (
          <Link key={r.client_id} to={`/kunden/${r.client_id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary">
            <span className="truncate">{r.client_name || '—'}</span>
            <span className="text-xs text-muted-foreground shrink-0">{r.grund}{r.marke ? ` („${r.marke}“)` : ''}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
