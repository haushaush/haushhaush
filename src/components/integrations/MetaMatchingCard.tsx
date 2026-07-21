// Admin card for the Meta-Ads ↔ Notion-Kunden matching engine.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Check, X as XIcon, Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { MetaActiveMatchesTable, type ActiveMatch } from "./MetaActiveMatchesTable";
import { ManualMetaLinkModal } from "./ManualMetaLinkModal";
import { getKundeDisplayName } from "@/lib/kunde-display-name";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RotateCcw } from "lucide-react";

interface RunSummary {
  ran_at: string;
  auto_matched: number;
  pending: number;
  no_match: number;
  total_accounts: number;
}

interface PendingRow {
  id: string;
  kunde_id: string;
  meta_account_id: string;
  meta_account_name: string | null;
  confidence: number;
  reasoning: string | null;
  source: string;
  kunde?: { client_name: string; unternehmen: string | null; vor_nachname: string | null };
}

export function MetaMatchingCard() {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [active, setActive] = useState<ActiveMatch[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadingActive(true);
    const [{ data: setting }, { data: pen }, { data: act }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "meta_match_last_run").maybeSingle(),
      supabase
        .from("pending_meta_matches")
        .select("id, kunde_id, meta_account_id, meta_account_name, confidence, reasoning, source")
        .order("confidence", { ascending: false }),
      supabase
        .from("kunde_meta_accounts")
        .select(
          "id, meta_account_id, meta_account_name, match_type, match_confidence, matched_at, matched_by, kunde:close_deals(id, unternehmen, client_name, vor_nachname)",
        )
        .order("matched_at", { ascending: false }),
    ]);
    if (setting?.value) setSummary(setting.value as any);

    const rows = (pen || []) as PendingRow[];
    if (rows.length > 0) {
      const ids = Array.from(new Set(rows.map((r) => r.kunde_id)));
      const { data: kunden } = await supabase
        .from("close_deals")
        .select("id, client_name, unternehmen, vor_nachname")
        .in("id", ids);
      const map = new Map((kunden || []).map((k: any) => [k.id, k]));
      rows.forEach((r) => { r.kunde = map.get(r.kunde_id); });
    }
    setPending(rows);
    setActive((act || []) as unknown as ActiveMatch[]);
    setLoadingActive(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived counts from real tables
  const autoCount = active.filter((m) => m.match_type === "auto").length;
  const aiCount = active.filter((m) => m.match_type === "ai").length;
  const manualCount = active.filter((m) => m.match_type === "manual").length;
  const pendingCount = pending.length;
  const totalAccounts = summary?.total_accounts ?? 0;
  const matchedCount = active.length;
  const noMatchCount = Math.max(0, totalAccounts - matchedCount - pendingCount);

  const runMatching = async () => {
    setRunning(true);
    const t = toast.loading("Matching läuft…");
    try {
      const { data, error } = await supabase.functions.invoke("match-meta-accounts", {
        body: { trigger: "manual" },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Matching fehlgeschlagen");
      toast.success(
        `Fertig: ${data.auto_matched} automatisch · ${data.pending} zur Prüfung · ${data.no_match} ohne Match`,
        { id: t },
      );
      await load();
    } catch (e) {
      toast.error("Fehler beim Matching", { id: t, description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const rematchAll = async () => {
    setRunning(true);
    const t = toast.loading("Auto- & KI-Matches werden gelöscht und neu berechnet…");
    try {
      // Wipe non-manual matches and pending suggestions
      const [{ error: delAuto }, { error: delPending }] = await Promise.all([
        supabase.from("kunde_meta_accounts").delete().in("match_type", ["auto", "ai"]),
        supabase.from("pending_meta_matches").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (delAuto) throw delAuto;
      if (delPending) throw delPending;

      const { data, error } = await supabase.functions.invoke("match-meta-accounts", {
        body: { trigger: "manual-rematch" },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Matching fehlgeschlagen");
      toast.success(
        `Neu gematcht: ${data.auto_matched} automatisch · ${data.pending} zur Prüfung · ${data.no_match} ohne Match`,
        { id: t },
      );
      await load();
    } catch (e) {
      toast.error("Fehler beim Neu-Matching", { id: t, description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const accept = async (row: PendingRow) => {
    setBusyId(row.id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("kunde_meta_accounts").insert({
      kunde_id: row.kunde_id,
      meta_account_id: row.meta_account_id,
      meta_account_name: row.meta_account_name,
      match_type: row.source === "ai" ? "ai" : "auto",
      match_confidence: row.confidence,
      matched_by: u?.user?.id || null,
    });
    if (!error) {
      await supabase.from("pending_meta_matches").delete().eq("id", row.id);
      toast.success("Verknüpfung bestätigt");
      await load();
    } else {
      toast.error("Fehler", { description: error.message });
    }
    setBusyId(null);
  };

  const reject = async (row: PendingRow) => {
    setBusyId(row.id);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("rejected_meta_matches").insert({
      kunde_id: row.kunde_id,
      meta_account_id: row.meta_account_id,
      rejected_by: u?.user?.id || null,
    });
    await supabase.from("pending_meta_matches").delete().eq("id", row.id);
    toast.info("Verknüpfung abgelehnt");
    setBusyId(null);
    await load();
  };

  const acceptAllAbove70 = async () => {
    const targets = pending.filter((p) => p.confidence >= 70);
    if (targets.length === 0) return;
    const t = toast.loading(`${targets.length} Verknüpfungen werden bestätigt…`);
    const { data: u } = await supabase.auth.getUser();
    const inserts = targets.map((row) => ({
      kunde_id: row.kunde_id,
      meta_account_id: row.meta_account_id,
      meta_account_name: row.meta_account_name,
      match_type: row.source === "ai" ? "ai" : "auto",
      match_confidence: row.confidence,
      matched_by: u?.user?.id || null,
    }));
    const { error } = await supabase
      .from("kunde_meta_accounts")
      .upsert(inserts, { onConflict: "meta_account_id", ignoreDuplicates: true });
    if (error) {
      toast.error("Fehler", { id: t, description: error.message });
      return;
    }
    await supabase.from("pending_meta_matches").delete().in("id", targets.map((t) => t.id));
    toast.success(`${targets.length} bestätigt`, { id: t });
    await load();
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Meta Ads ↔ Notion Kunden Matching
          </CardTitle>
          <Button size="sm" onClick={runMatching} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Jetzt ausführen
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Manuell verknüpfen
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={running}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Alle neu matchen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Alle Matches zurücksetzen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle bestehenden automatischen und KI-Matches werden gelöscht und neu ausgeführt. Manuelle
                  Verknüpfungen bleiben unberührt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={rematchAll}>Neu matchen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
          <span>
            Zuletzt ausgeführt:{" "}
            {summary?.ran_at
              ? new Date(summary.ran_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
              : "noch nie"}
          </span>
          <span>·</span>
          <span>{autoCount} automatisch</span>
          <span>·</span>
          <span>{aiCount} via KI</span>
          <span>·</span>
          <span>{manualCount} manuell</span>
          <span>·</span>
          <span>{pendingCount} zur Prüfung</span>
          {totalAccounts > 0 && (
            <>
              <span>·</span>
              <span>{noMatchCount} ohne Match</span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-6">
        {pending.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {pending.length} Vorschläge zur Prüfung
              </p>
              <Button size="sm" variant="outline" onClick={acceptAllAbove70}>
                Alle ab 70 % bestätigen
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Kunde</th>
                    <th className="text-left font-medium px-3 py-2">Meta Account</th>
                    <th className="text-right font-medium px-3 py-2">Confidence</th>
                    <th className="text-left font-medium px-3 py-2">Begründung</th>
                    <th className="text-right font-medium px-3 py-2 w-20">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((row) => (
                    <tr key={row.id} className="border-t border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <p className="font-medium text-xs">{getKundeDisplayName(row.kunde)}</p>
                        {row.kunde?.unternehmen ? (
                          <p className="text-[10px] text-muted-foreground">{row.kunde.unternehmen}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-xs">{row.meta_account_name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{row.meta_account_id}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="outline" className="rounded-[4px] text-[10px] tabular-nums">
                          {Math.round(row.confidence)} %
                          {row.source === "ai" && <span className="ml-1">✨</span>}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground max-w-[260px]">
                        {row.reasoning || "–"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => accept(row)}
                            disabled={busyId === row.id}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                            title="Bestätigen"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => reject(row)}
                            disabled={busyId === row.id}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            title="Ablehnen"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <MetaActiveMatchesTable matches={active} loading={loadingActive} onChanged={load} />
      </CardContent>
      <ManualMetaLinkModal open={manualOpen} onOpenChange={setManualOpen} onSaved={load} />
    </Card>
  );
}
