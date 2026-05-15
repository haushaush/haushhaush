import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Clock, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";

interface StatusStats {
  total: number;
  withStatus: number;
  active: number;
  withoutStatus: number;
  newestSync: string | null;
}

export function SyncStatusBanner() {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatusStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadStats = async () => {
    const { data } = await supabase
      .from("referenz_meta_ads" as any)
      .select("effective_status, status, last_synced_at")
      .is("deleted_at", null);
    const rows = (data ?? []) as any[];
    const total = rows.length;
    const withStatus = rows.filter(a => a.effective_status || a.status).length;
    const active = rows.filter(a => (a.effective_status || a.status) === "ACTIVE").length;
    const newest = rows
      .map(a => a.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    setStats({ total, withStatus, active, withoutStatus: total - withStatus, newestSync: newest });
  };

  useEffect(() => {
    loadStats();
    const id = setInterval(loadStats, 30000);
    return () => clearInterval(id);
  }, []);

  const triggerSync = async () => {
    setIsSyncing(true);
    toast({ title: "Sync läuft", description: "Aktualisiere Status & Metriken (kann 1–2 Minuten dauern)…" });
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-refresh-metrics", {
        body: { datePreset: "last_30d" },
      });
      if (error) throw error;
      const refreshed = (data as any)?.refreshed ?? 0;
      toast({ title: "Sync abgeschlossen", description: `${refreshed} Anzeigen aktualisiert.` });
      await loadStats();
      // Soft reload: dispatch event + reload page data via window
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast({ title: "Sync-Fehler", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!stats || stats.total === 0) return null;

  // CASE 1: keine Status-Daten überhaupt
  if (stats.withStatus === 0) {
    return (
      <div className="mb-6 max-w-3xl mx-auto rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Status-Daten fehlen</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
              {stats.total} Anzeigen haben noch keinen Live-Status. Der Filter „Aktiv" funktioniert erst nach dem ersten Sync.
            </p>
          </div>
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isSyncing ? "Läuft…" : "Jetzt syncen"}
          </button>
        </div>
      </div>
    );
  }

  // CASE 2: Sync stale (>36h)
  if (stats.newestSync) {
    const hoursAgo = (Date.now() - new Date(stats.newestSync).getTime()) / 3600000;
    if (hoursAgo > 36) {
      return (
        <div className="mb-4 max-w-3xl mx-auto px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-gray-700 dark:text-gray-300">
            Status zuletzt synchronisiert vor {Math.round(hoursAgo / 24)} Tagen
          </span>
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="ml-auto font-semibold text-amber-700 dark:text-amber-400 hover:underline"
          >
            {isSyncing ? "Läuft…" : "Jetzt syncen"}
          </button>
        </div>
      );
    }
  }

  // CASE 3: Teilweise Daten fehlen
  if (stats.withoutStatus > 0) {
    return (
      <div className="mb-4 max-w-3xl mx-auto px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-xl flex items-center gap-2 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-gray-700 dark:text-gray-300 tabular-nums">
          {stats.active} aktiv · {stats.withStatus}/{stats.total} mit Status
        </span>
        <button
          onClick={triggerSync}
          disabled={isSyncing}
          className="ml-auto font-semibold text-gray-700 dark:text-gray-300 hover:underline"
        >
          {isSyncing ? "Läuft…" : "Restliche syncen"}
        </button>
      </div>
    );
  }

  return null;
}
