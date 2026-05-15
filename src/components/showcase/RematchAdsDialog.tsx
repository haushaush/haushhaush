import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Wand2, Loader2, CheckCircle2 } from 'lucide-react';

interface Stats {
  total: number;
  matched_by_account: number;
  matched_by_keyword: number;
  already_correct: number;
  no_match: number;
  skipped_manual: number;
}

interface Result { success: boolean; stats: Stats; updated: number }

export function RematchAdsDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { toast } = useToast();
  const [overrideManual, setOverrideManual] = useState(false);
  const [onlyUnmatched, setOnlyUnmatched] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('rematch-all-ads', {
        body: { override_manual: overrideManual, only_unmatched: onlyUnmatched },
      });
      if (error) throw error;
      setResult(data as Result);
      toast({ title: 'Re-Match fertig', description: `${(data as any)?.updated ?? 0} Anzeigen aktualisiert` });
      onDone?.();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e?.message ?? 'Unbekannt', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const close = () => { if (!running) { setResult(null); onClose(); } };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anzeigen neu matchen</DialogTitle>
          <DialogDescription>
            Geht alle Anzeigen durch und versucht sie über Werbekonto-Verknüpfungen mit Kunden zu matchen.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-gray-300 dark:hover:border-gray-700">
              <input
                type="checkbox"
                checked={onlyUnmatched}
                onChange={e => setOnlyUnmatched(e.target.checked)}
                className="mt-1 accent-teal-600"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Nur Anzeigen ohne Kunden-Match</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Empfohlen. Bestehende Zuordnungen bleiben unverändert.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 cursor-pointer hover:border-gray-300 dark:hover:border-gray-700">
              <input
                type="checkbox"
                checked={overrideManual}
                onChange={e => setOverrideManual(e.target.checked)}
                className="mt-1 accent-teal-600"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Manuelle Zuordnungen überschreiben</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Riskant — auch von Hand gesetzte Zuordnungen werden neu berechnet.</div>
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-semibold">Fertig — {result.updated} aktualisiert</span>
            </div>
            <dl className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
              <Row label="Gesamt geprüft" value={result.stats.total} />
              <Row label="Über Werbekonto gematcht" value={result.stats.matched_by_account} />
              <Row label="Über Keyword gematcht" value={result.stats.matched_by_keyword} />
              <Row label="Bereits korrekt" value={result.stats.already_correct} />
              <Row label="Kein Match" value={result.stats.no_match} />
              {result.stats.skipped_manual > 0 && <Row label="Manuell übersprungen" value={result.stats.skipped_manual} />}
            </dl>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={close} disabled={running}>Abbrechen</Button>
              <Button onClick={run} disabled={running}>
                {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Läuft...</> : <><Wand2 className="w-4 h-4 mr-2" /> Neu matchen</>}
              </Button>
            </>
          ) : (
            <Button onClick={close}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-gray-600 dark:text-gray-400">{label}</dt>
      <dd className="font-semibold text-gray-900 dark:text-white tabular-nums">{value}</dd>
    </div>
  );
}
