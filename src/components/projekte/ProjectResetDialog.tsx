import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';

type Customer = { name: string; services: string[]; client_id: string | null };
type Detail = { client_id: string | null; name: string | null; aktiv: boolean; archived: string[]; rescued: { feld: string; wert: string; quelle: string }[]; created: string[] };
type Counts = { unchanged: number; archived: number; rescued: number; created: number; details: Detail[] };
type Preview = Counts & { active_customers: number; customers: Customer[]; without_services: string[]; missing_links: string[]; status: string };
type Result = Counts & { active_customers: number; customers: Customer[]; without_services: string[]; status: string };
async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('projects-reset', { body });
  if (error) { let message = error.message; try { message = (await error.context?.json())?.error || message; } catch { /* retain message */ } throw new Error(message); }
  if (data?.error) throw new Error(data.error);
  return data;
}
export function ProjectResetDialog({ onDone }: { onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setBusy(true); setError(null); setPreview(null); setResult(null); setToken(null);
    try { const data = await invoke({ action: 'preview' }); setPreview(data.preview); setToken(data.token); }
    catch (e) { setError(e instanceof Error ? e.message : 'Vorschau nicht verfügbar.'); }
    finally { setBusy(false); }
  }
  async function execute() {
    if (!token || !preview || busy) return;
    setBusy(true); setError(null);
    try { const data = await invoke({ action: 'execute', token }); setResult(data.result); setToken(null); await onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ausführung fehlgeschlagen.'); setToken(null); }
    finally { setBusy(false); }
  }
  const details = (result || preview)?.details || [];
  const missing = result?.without_services || preview?.without_services || [];
  return <>
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setOpen(true); void load(); }}><RefreshCw className="h-3.5 w-3.5" />Projekte neu aufsetzen</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{result ? 'Projekte neu aufgesetzt' : 'Projekte neu aufsetzen – Vorschau'}</DialogTitle><DialogDescription>{result ? 'Archivierung und Neuanlage wurden gemeinsam abgeschlossen.' : 'Diese Vorschau verändert nichts. Bestehende Zeiten, KPI-Einträge und Verknüpfungen bleiben erhalten.'}</DialogDescription></DialogHeader>
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />{preview ? 'Projekte werden neu aufgesetzt …' : 'Aktive Kunden und Leistungen werden aus Close gelesen …'}</p>}
        {(preview || result) && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
            {([['unverändert', (result || preview)!.unchanged], [result ? 'archiviert' : 'werden archiviert', (result || preview)!.archived], [result ? 'Werte übernommen' : 'Werte werden übernommen', (result || preview)!.rescued], [result ? 'neu angelegt' : 'werden neu angelegt', (result || preview)!.created]] as const).map(([l, v]) => <div key={l} className="rounded-xl bg-muted/40 p-3"><p className="text-xl font-semibold">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
          </div>
          <p className="text-muted-foreground">Projekte der {(result || preview)!.active_customers} aktiven Kunden bleiben unverändert. Archiviert werden nur Projekte von Kunden, die in Close weder „Aktueller Klient“ noch „Pausiert“ sind, und Projekte ohne Kundenverknüpfung. Vorhandene Werte am Kunden werden nie überschrieben.</p>
          {missing.length > 0 && <p><strong>{missing.length}</strong> aktive Kunden haben keine Leistungen in Close – für sie entsteht nichts</p>}
          <p className="text-muted-foreground">Status der neuen Projekte: <span className="text-foreground font-medium">Laufzeitbetreuung</span></p>
          {preview?.missing_links.length ? <div role="alert" className="text-destructive"><p className="font-medium">Ausführung gesperrt: fehlende oder mehrdeutige Kundenverknüpfung</p><ul className="mt-2 list-disc pl-5">{preview.missing_links.map(name => <li key={name}>{name}</li>)}</ul></div> : null}
          <details className="border-t border-border pt-3"><summary className="cursor-pointer flex items-center gap-2 font-medium"><ChevronDown className="h-4 w-4" />Details je Kunde ({details.length})</summary><div className="divide-y divide-border mt-3">{details.map((d, i) => <div key={`${d.client_id}-${i}`} className="py-3 space-y-1"><p className="font-medium break-words">{d.name || 'Unbekannter Kunde'}{!d.aktiv && d.client_id && <span className="text-xs text-muted-foreground font-normal"> · nicht aktiv in Close</span>}</p>{d.archived.length > 0 && <p className="text-muted-foreground break-words">Archiviert: {d.archived.join(' · ')}</p>}{d.rescued.map((r, j) => <p key={j} className="text-muted-foreground break-words">Übernommen: {r.feld} = {r.wert} <span className="text-xs">(aus „{r.quelle}“)</span></p>)}{d.created.length > 0 && <p className="break-words">Neu: {d.created.join(' · ')}</p>}</div>)}</div></details>
          {missing.length > 0 && <div className="border-t border-border pt-3"><p className="font-medium">Kunden ohne Leistungen – zum Nacharbeiten</p><ul className="mt-2 space-y-1 text-muted-foreground">{missing.map(name => <li key={name}>{name}</li>)}</ul></div>}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{result ? 'Schließen' : 'Abbrechen'}</Button>
          {!result && !busy && (!preview || !token) && <Button variant="outline" onClick={() => void load()}>Vorschau neu laden</Button>}
          {!result && preview && <Button disabled={busy || !token || !!preview.missing_links.length} onClick={() => void execute()}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Jetzt ausführen</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}