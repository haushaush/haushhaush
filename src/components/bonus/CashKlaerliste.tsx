import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { alle, namensTreffer, qontoVerknuepfen } from '@/lib/kundenVerknuepfungen';

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');
// Same normalization as bonus-cash-sync.
const key = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

type Kunde = { id: string; name: string | null };
type Link = { id: string; qonto_client_id: string | null; qonto_client_name: string | null; client_id: string | null; is_confirmed: boolean };
type Inv = { qonto_invoice_id: string; client_id: string | null; client_name: string | null; paid_at: string | null; status: string | null };
type Eintrag = { qid: string; name: string; anzahl: number; letzte: string | null; link?: Link; offen: any[] };
type Gruppe = { key: string; name: string; eintraege: Eintrag[]; offen: any[] };

/** Clarification list: grouped by Qonto name, each Qonto record linked individually after explicit confirmation. */
export function CashKlaerliste({ rows, onChanged }: { rows: any[]; onChanged: () => void }) {
  const [kunden, setKunden] = useState<Kunde[] | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [inv, setInv] = useState<Inv[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [wahl, setWahl] = useState<Record<string, string>>({});
  const [frage, setFrage] = useState<{ e: Eintrag; kunde: Kunde; score: number; abweichend: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const [c, l, i] = await Promise.all([
        supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
        alle('qonto_client_links', 'id, qonto_client_id, qonto_client_name, client_id, is_confirmed'),
        alle('qonto_client_invoices', 'qonto_invoice_id, client_id, client_name, paid_at, status'),
      ]);
      if (c.error || l.error || i.error) { setFehler(c.error?.message || 'Qonto-Daten konnten nicht vollständig geladen werden'); return; }
      setKunden((c.data as Kunde[]) || []); setLinks(l.rows as Link[]); setInv(i.rows as Inv[]);
    })().catch(e => setFehler(e instanceof Error ? e.message : String(e)));
  }, [tick]);

  const kundeName = useMemo(() => new Map((kunden || []).map(k => [k.id, k.name || 'Kunde'])), [kunden]);

  const gruppen = useMemo<Gruppe[]>(() => {
    const invById = new Map((inv || []).map(x => [x.qonto_invoice_id, x]));
    const m = new Map<string, Gruppe>();
    for (const r of rows) {
      const lex = r.quelle === 'lexoffice';
      const k = (lex ? 'lexoffice|' : '') + key(r.empfaenger_name);
      const g = m.get(k) || { key: k, name: r.empfaenger_name || '–', eintraege: [], offen: [], lex } as Gruppe;
      g.offen.push(r); m.set(k, g);
    }
    for (const g of m.values()) {
      if ((g as any).lex) continue;
      const byQid = new Map<string, Eintrag>();
      for (const x of inv || []) {
        if (!x.client_id || key(x.client_name) !== g.key) continue;
        const e = byQid.get(x.client_id) || { qid: x.client_id, name: x.client_name || g.name, anzahl: 0, letzte: null, offen: [] };
        e.anzahl++; if (x.status === 'paid' && x.paid_at && (!e.letzte || x.paid_at > e.letzte)) e.letzte = x.paid_at;
        byQid.set(x.client_id, e);
      }
      for (const r of g.offen) { const q = invById.get(r.quelle_id)?.client_id; if (q && byQid.has(q)) byQid.get(q)!.offen.push(r); }
      for (const e of byQid.values()) e.link = links.find(l => l.qonto_client_id === e.qid);
      g.eintraege = [...byQid.values()].sort((a, b) => b.anzahl - a.anzahl);
    }
    return [...m.values()];
  }, [rows, inv, links]);

  /** Suggestion: customer already set for the same name first, otherwise existing name detection. */
  const vorschlag = (g: Gruppe): { kunde: Kunde; score: number } | null => {
    const gesetzt = g.eintraege.find(e => e.link?.is_confirmed && e.link.client_id)?.link?.client_id
      || links.find(l => l.is_confirmed && l.client_id && key(l.qonto_client_name) === g.key)?.client_id;
    if (gesetzt) return { kunde: { id: gesetzt, name: kundeName.get(gesetzt) ?? null }, score: 1 };
    let best: { kunde: Kunde; score: number } | null = null;
    for (const c of kunden || []) { const s = namensTreffer(g.name, c.name); if (s >= 0.5 && (!best || s > best.score)) best = { kunde: c, score: s }; }
    return best;
  };

  const bestaetigen = async () => {
    if (!frage) return;
    setBusy(true);
    try {
      await qontoVerknuepfen(frage.e.qid, frage.e.name, frage.kunde.id, Math.round(frage.score * 100) / 100);
      toast.success(`${frage.e.name} → ${frage.kunde.name}`, { description: 'Zählt nach dem nächsten Zahlungsabgleich.' });
      setTick(t => t + 1); onChanged();
    } catch (e: any) { toast.error('Verknüpfung fehlgeschlagen', { description: e?.message }); }
    finally { setBusy(false); setFrage(null); }
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Klärliste – nicht zugeordnete Zahlungen ({rows.length})</h3>
      {fehler && <p className="text-sm text-destructive mb-2">Vorschläge konnten nicht geladen werden: {fehler}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Keine offenen Zahlungen.</p> : !inv || !kunden ? <p className="text-xs text-muted-foreground">…</p> : (
        <div className="divide-y divide-border">
          {gruppen.map(g => {
            const v = vorschlag(g);
            const zugeordnet = [...new Set(g.eintraege.map(e => e.link?.is_confirmed ? e.link.client_id : null).filter(Boolean) as string[])];
            const summe = g.offen.reduce((s, r) => s + Number(r.betrag || 0), 0);
            const gruende = [...new Set(g.offen.map(r => r.klaer_grund).filter(Boolean))];
            return (
              <div key={g.key} className="py-2.5 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{(g as any).lex ? 'lexoffice' : 'Qonto'}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{g.offen.length} offen · {eur(summe)}</span>
                  {g.eintraege.length > 1 && <span className="ml-auto text-xs text-muted-foreground">{g.eintraege.length} Einträge in Qonto</span>}
                </div>
                {gruende.length > 0 && <p className="text-xs text-muted-foreground">{gruende.join(' · ')}</p>}
                {zugeordnet.length > 1 && (
                  <p className="text-xs flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-warning shrink-0" />
                    Gleicher Name, verschiedene Kunden: {zugeordnet.map(id => kundeName.get(id)).join(', ')}. Bitte prüfen, ob das gewollt ist.</p>
                )}
                {(g as any).lex && <p className="text-xs text-muted-foreground pl-3">lexoffice-Kontakt – zuordnen unter Kunden → Verknüpfungen, Abschnitt „lexoffice-Kontakte ohne Kundenzuordnung“.</p>}
                {!(g as any).lex && g.eintraege.length === 0 && <p className="text-xs text-muted-foreground pl-3">Kein Qonto-Datensatz zu diesem Namen gefunden – über „Zahlungs-Zuordnung“ zuordnen.</p>}
                {g.eintraege.map(e => {
                  const verkn = e.link?.is_confirmed && e.link.client_id ? e.link.client_id : null;
                  const gewaehlt = wahl[e.qid] ?? v?.kunde.id ?? '';
                  const kunde = gewaehlt ? { id: gewaehlt, name: kundeName.get(gewaehlt) ?? null } : null;
                  return (
                    <div key={e.qid} className="pl-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="tabular-nums text-muted-foreground">{e.anzahl} {e.anzahl === 1 ? 'Rechnung' : 'Rechnungen'} · letzte {dt(e.letzte)} · ID {e.qid.slice(0, 8)}…{e.offen.length ? ` · ${e.offen.length} offen` : ''}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {verkn ? <span className="flex items-center gap-1">→ {kundeName.get(verkn)} <Check className="h-3.5 w-3.5 text-success" /></span> : <>
                          <select value={gewaehlt} onChange={ev => setWahl(w => ({ ...w, [e.qid]: ev.target.value }))} className="h-7 max-w-[220px] rounded-md bg-background border border-border px-1.5" aria-label="Kunde wählen">
                            <option value="">Kunde wählen…</option>
                            {kunden.map(k => <option key={k.id} value={k.id}>{k.name}{v?.kunde.id === k.id ? ` (Vorschlag${v.score < 1 ? ` ${Math.round(v.score * 100)} %` : ''})` : ''}</option>)}
                          </select>
                          <Button size="sm" variant="outline" className="h-7" disabled={!kunde} onClick={() => kunde && setFrage({ e, kunde, score: v?.kunde.id === kunde.id ? v.score : 1, abweichend: zugeordnet.filter(id => id !== kunde.id).map(id => kundeName.get(id) || 'Kunde') })}>Verknüpfen</Button>
                        </>}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <AlertDialog open={!!frage} onOpenChange={o => !o && !busy && setFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknüpfung bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              Qonto-Eintrag „{frage?.e.name}“ (ID {frage?.e.qid.slice(0, 8)}…) wird dauerhaft dem Kunden „{frage?.kunde.name}“ zugeordnet. Alle Rechnungen dieses Datensatzes zählen künftig für diesen Kunden.
              {!!frage?.abweichend.length && <span className="block mt-2 font-medium text-foreground">Achtung: Ein gleichnamiger Qonto-Eintrag gehört zu {frage.abweichend.join(', ')}. Damit hat dieser Name verschiedene Kunden – die Zuordnung läuft dann nur noch über die Qonto-ID.</span>}
            </AlertDialogDescription>
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
