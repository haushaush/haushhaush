import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Row = { name_norm: string; name_anzeige: string; grund: string | null; angelegt_am: string };

/** Konzerninterne Rechnungsempfänger – werden beim lexoffice-Abgleich übersprungen. */
export function InterneEmpfaenger() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = async () => {
    const { data, error } = await (supabase.from as any)('buchhaltung_intern').select('*').order('name_anzeige');
    if (error) toast.error(`Interne Empfänger nicht lesbar: ${error.message}`);
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  const entfernen = async (r: Row) => {
    const { error } = await (supabase.from as any)('buchhaltung_intern').delete().eq('name_norm', r.name_norm);
    if (error) { toast.error(error.message); return; }
    toast.success(`„${r.name_anzeige}" ist nicht mehr intern – beim nächsten Abgleich wieder dabei`); load();
  };
  return (
    <Card className="border-border bg-card">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Interne Rechnungsempfänger</CardTitle>
        <p className="text-xs text-muted-foreground">Werden beim lexoffice-Abgleich übersprungen. Hinzufügen in Finanzen → Verknüpfungen („Als intern markieren").</p></CardHeader>
      <CardContent>
        {!rows ? <p className="text-sm text-muted-foreground">Lade …</p> : !rows.length ? <p className="text-sm text-muted-foreground">Keine internen Empfänger.</p> : (
          <div className="divide-y divide-border/50">
            {rows.map(r => (
              <div key={r.name_norm} className="flex items-center gap-3 py-2 text-sm">
                <div className="flex-1 min-w-0"><div className="font-medium truncate">{r.name_anzeige}</div>{r.grund && <div className="text-xs text-muted-foreground">{r.grund}</div>}</div>
                <span className="text-xs text-muted-foreground tabular-nums">{new Date(r.angelegt_am).toLocaleDateString('de-DE')}</span>
                <Button size="sm" variant="ghost" onClick={() => entfernen(r)} title="Entfernen"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
