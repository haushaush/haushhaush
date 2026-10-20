import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Art = 'intern' | 'vorlage';
type Row = { name_norm: string; name_anzeige: string; grund: string | null; art: Art | null; angelegt_am: string };

const ART_GRUND: Record<Art, string> = { intern: 'Intern', vorlage: 'Vorlage- oder Testrechnung' };

const GRUPPEN: Record<Art, { titel: string; hinweis: string; badge: string }> = {
  intern: { titel: 'Konzernintern', hinweis: 'Rechnungen zwischen unseren eigenen Gesellschaften.', badge: 'intern' },
  vorlage: { titel: 'Vorlagen & Tests', hinweis: 'Vorlagen- und Testrechnungen, die nie zu einem Kunden gehören.', badge: 'Vorlage' },
};

/** Ausgenommene Rechnungsempfänger – werden beim lexoffice-Abgleich übersprungen, nach Art gruppiert. */
export function InterneEmpfaenger() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = async () => {
    const { data, error } = await (supabase.from as any)('buchhaltung_intern').select('*').order('name_anzeige');
    if (error) toast.error(`Ausgenommene Empfänger nicht lesbar: ${error.message}`);
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);
  const entfernen = async (r: Row) => {
    const { error } = await (supabase.from as any)('buchhaltung_intern').delete().eq('name_norm', r.name_norm);
    if (error) { toast.error(error.message); return; }
    toast.success(`„${r.name_anzeige}" ist nicht mehr ausgenommen – beim nächsten Abgleich wieder dabei`); load();
  };

  // Bekannte Arten zuerst; unbekannte Art-Werte landen darunter, damit nichts still verschwindet.
  const bekannt: Art[] = ['intern', 'vorlage'];
  const fremd = (rows || []).filter(r => !r.art || !bekannt.includes(r.art));
  const gruppen = bekannt
    .map(art => ({ art: art as string, ...GRUPPEN[art], items: (rows || []).filter(r => r.art === art) }))
    .concat(fremd.length ? [{ art: 'sonstige', titel: 'Sonstige', hinweis: 'Art nicht erkannt – bitte prüfen.', badge: 'unbekannt', items: fremd }] : []);

  return (
    <Card className="border-border bg-card">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Ausgenommene Rechnungsempfänger</CardTitle>
        <p className="text-xs text-muted-foreground">Werden beim lexoffice-Abgleich übersprungen. Hinzufügen in Finanzen → Verknüpfungen („Als intern markieren" oder „Als Vorlage markieren").</p></CardHeader>
      <CardContent>
        {!rows ? <p className="text-sm text-muted-foreground">Lade …</p> : !rows.length ? <p className="text-sm text-muted-foreground">Keine ausgenommenen Empfänger.</p> : (
          <div className="space-y-5">
            {gruppen.map(g => g.items.length === 0 ? null : (
              <div key={g.art}>
                <div className="flex items-baseline gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titel}</h4>
                  <span className="text-xs text-muted-foreground tabular-nums">{g.items.length}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{g.hinweis}</p>
                <div className="divide-y divide-border/50">
                  {g.items.map(r => (
                    <div key={r.name_norm} className="flex items-center gap-3 py-2 text-sm">
                      <div className="flex-1 min-w-0"><div className="font-medium truncate">{r.name_anzeige}</div>{r.grund && <div className="text-xs text-muted-foreground">{r.grund}</div>}</div>
                      <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">{(r.art && GRUPPEN[r.art]) ? GRUPPEN[r.art].badge : (r.art || 'unbekannt')}</Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">{new Date(r.angelegt_am).toLocaleDateString('de-DE')}</span>
                      <Button size="sm" variant="ghost" onClick={() => entfernen(r)} title="Entfernen"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
