import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface LogRow {
  id: string;
  step: string;
  upserted: number | null;
  errors: number | null;
  duration_ms: number | null;
  created_at: string;
}

export function SalesSyncCard() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);

  const loadLogs = async () => {
    const { data } = await (supabase as any)
      .from('sales_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    setLogs((data as LogRow[]) || []);
  };

  useEffect(() => { loadLogs(); }, []);

  const run = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('sync-sales-orchestrator', { body: {} });
      if (error) throw error;
      toast({ title: 'Sales-Sync gestartet', description: 'Die Schritte laufen nacheinander durch.' });
    } catch (e: any) {
      toast({ title: 'Sync fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
      loadLogs();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">Sales-Sync</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLogs}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={run} disabled={running}>
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
            Jetzt synchronisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Sync-Läufe protokolliert.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-3 text-xs border-b border-border/50 pb-1.5 last:border-0">
                <span className="font-medium truncate">{l.step}</span>
                <div className="flex items-center gap-2 shrink-0 tabular-nums text-muted-foreground">
                  <span>{l.upserted ?? 0} Zeilen</span>
                  {(l.errors ?? 0) > 0
                    ? <Badge variant="destructive" className="text-[10px]">{l.errors} Fehler</Badge>
                    : <Badge variant="outline" className="text-[10px]">OK</Badge>}
                  <span>{Math.round((l.duration_ms ?? 0) / 1000)}s</span>
                  <span>{new Date(l.created_at).toLocaleString('de-DE')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
