import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';

type Customer = { name: string; services: string[]; client_id: string | null };
type Preview = { archive_count: number; create_count: number; keep_count: number; active_customers: number; customers: Customer[]; without_services: string[]; missing_links: string[]; status: string };
type Result = { archived: number; created: number; kept: number; active_customers: number; customers: Customer[]; without_services: string[]; status: string };
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
  const customers = result?.customers || preview?.customers || [];
  const missing = result?.without_services || preview?.without_services || [];
  return <>
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setOpen(true); void load(); }}><RefreshCw className="h-3.5 w-3.5" />Projekte neu aufsetzen</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{result ? 'Projekte neu aufgesetzt' : 'Projekte neu aufsetzen – Vorschau'}</DialogTitle><DialogDescription>{result ? 'Archivierung und Neuanlage wurden gemeinsam abgeschlossen.' : 'Diese Vorschau verändert nichts. Bestehende Zeiten, KPI-Einträge und Verknüpfungen bleiben erhalten.'}</DialogDescription></DialogHeader>
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />{preview ? 'Projekte werden neu aufgesetzt …' : 'Aktive Kunden und Leistungen werden aus Close gelesen …'}</p>}
        {(preview || result) && <div className="space-y-4 text-sm">
          <div className="space-y-2 tabular-nums">
            <p><strong>{result?.archived ?? preview?.archive_count}</strong> Projekte {result ? 'archiviert' : 'werden archiviert'}</p>
            <p><strong>{result?.created ?? preview?.create_count}</strong> Projekte {result ? 'neu angelegt' : 'werden neu angelegt'} für <strong>{result?.active_customers ?? preview?.active_customers}</strong> aktive Kunden</p>
            <p className="text-muted-foreground">{result?.kept ?? preview?.keep_count} passende aktive Projekte bleiben bestehen</p>
            <p><strong>{missing.length}</strong> aktive Kunden haben keine Leistungen in Close – für sie entsteht nichts</p>
          </div>
          <p className="text-muted-foreground">Status der neuen Projekte: <span className="text-foreground font-medium">Laufzeitbetreuung</span></p>
          {preview?.missing_links.length ? <div role="alert" className="text-destructive"><p className="font-medium">Ausführung gesperrt: fehlende oder mehrdeutige Kundenverknüpfung</p><ul className="mt-2 list-disc pl-5">{preview.missing_links.map(name => <li key={name}>{name}</li>)}</ul></div> : null}
          <details className="border-t border-border pt-3"><summary className="cursor-pointer flex items-center gap-2 font-medium"><ChevronDown className="h-4 w-4" />Projekte je Kunde ({customers.length})</summary><div className="divide-y divide-border mt-3">{customers.map((c, i) => <div key={`${c.client_id}-${i}`} className="py-3"><p className="font-medium break-words">{c.name}</p><p className="text-muted-foreground mt-1 break-words">{c.services.length ? c.services.join(' · ') : 'Keine Leistungen in Close'}</p></div>)}</div></details>
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