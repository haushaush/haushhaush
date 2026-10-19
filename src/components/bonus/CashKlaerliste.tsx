import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { namensTreffer } from '@/lib/kundenVerknuepfungen';

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');
const key = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

type Kunde = { id: string; name: string | null };
type Vorschlag = { kunde: Kunde; score: number };

/** Clarification list for unassigned payments: name suggestion per recipient, link only after explicit confirmation. */
export function CashKlaerliste({ rows, onChanged }: { rows: any[]; onChanged: () => void }) {
  const [kunden, setKunden] = useState<Kunde[] | null>(null);
  const [links, setLinks] = useState<Map<string, { id: string; client_id: string | null; is_confirmed: boolean }>>(new Map());
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState<{ name: string; qid: string | null; v: Vorschlag } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const [c, l] = await Promise.all([
        supabase.from('clients').select('id, name').is('deleted_at', null),
        supabase.from('qonto_client_links').select('id, qonto_client_name, client_id, is_confirmed'),
      ]);
      if (c.error || l.error) { setFehler((c.error || l.error)!.message); return; }
      setKunden((c.data as Kunde[]) || []);
      setLinks(new Map(((l.data as any[]) || []).map(x => [key(x.qonto_client_name), x])));
    })().catch(e => setFehler(e instanceof Error ? e.message : String(e)));
  }, [tick]);

  const vorschlaege = useMemo(() => {
    const m = new Map<string, Vorschlag | null>();
    if (!kunden) return m;
    for (const r of rows) {
      const k = key(r.empfaenger_name);
      if (!k || m.has(k)) continue;
      let best: Vorschlag | null = null;
      for (const c of kunden) { const s = namensTreffer(r.empfaenger_name, c.name); if (s >= 0.5 && (!best || s > best.score)) best = { kunde: c, score: s }; }
      m.set(k, best);
    }
    return m;
  }, [rows, kunden]);

  const bestaetigen = async () => {
    if (!frage) return;
    setBusy(true);
    const existing = links.get(key(frage.name));
    const row = { qonto_client_name: frage.name, qonto_client_id: frage.qid, client_id: frage.v.kunde.id, is_confirmed: true, match_type: 'manual', confidence: Math.round(frage.v.score * 100) / 100, updated_at: new Date().toISOString() };
    const { error } = existing ? await supabase.from('qonto_client_links').update(row).eq('id', existing.id) : await supabase.from('qonto_client_links').insert(row);
    setBusy(false); setFrage(null);
    if (error) return toast.error('Verknüpfung fehlgeschlagen', { description: error.message });
    toast.success(`${frage.name} → ${frage.v.kunde.name}`, { description: 'Zählt nach dem nächsten Zahlungsabgleich.' });
    setTick(t => t + 1); onChanged();
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
      <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Klärliste – nicht zugeordnete Zahlungen ({rows.length})</h3>
      {fehler && <p className="text-sm text-destructive mb-2">Vorschläge konnten nicht geladen werden: {fehler}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Keine offenen Zahlungen.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3 font-normal">Rechnungsempfänger</th><th className="py-1 pr-3 font-normal">Betrag</th><th className="py-1 pr-3 font-normal">Eingang</th><th className="py-1 pr-3 font-normal">Grund</th><th className="py-1 font-normal">Vorschlag</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => {
                const k = key(r.empfaenger_name);
                const link = links.get(k);
                const verknuepft = !!link?.is_confirmed && !!link.client_id;
                const v = vorschlaege.get(k);
                const ohneKunde = !r.client_id;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3">{r.empfaenger_name || '–'}{r.rechnungsnummer && <div className="text-xs text-muted-foreground">{r.rechnungsnummer}</div>}</td>
                    <td className="py-2 pr-3 tabular-nums">{eur(Number(r.betrag))}</td>
                    <td className="py-2 pr-3 tabular-nums">{dt(r.eingang_am)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.klaer_grund || '–'}</td>
                    <td className="py-2">
                      {!ohneKunde ? <span className="text-xs text-muted-foreground">{r.clients?.name || 'Kunde'} verknüpft</span>
                        : verknuepft ? <span className="text-xs text-muted-foreground">Verknüpft – zählt nach dem nächsten Abgleich</span>
                        : !kunden ? <span className="text-xs text-muted-foreground">…</span>
                        : v ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{v.kunde.name} <span className="text-xs text-muted-foreground tabular-nums">({Math.round(v.score * 100)} %)</span></span>
                            <Button size="sm" variant="outline" disabled={!r.empfaenger_name} onClick={() => setFrage({ name: r.empfaenger_name, qid: r.qonto_client_id ?? null, v })}>Bestätigen</Button>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Kein Vorschlag – über „Zahlungs-Zuordnung“ zuordnen</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AlertDialog open={!!frage} onOpenChange={o => !o && !busy && setFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknüpfung bestätigen</AlertDialogTitle>
            <AlertDialogDescription>„{frage?.name}“ wird dauerhaft dem Kunden „{frage?.v.kunde.name}“ zugeordnet. Alle Rechnungen an diesen Empfänger zählen künftig für diesen Kunden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); bestaetigen(); }}>Verknüpfen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
