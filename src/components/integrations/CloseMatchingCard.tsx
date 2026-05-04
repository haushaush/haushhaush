// Admin card for the Close Won/Upsell ↔ Kunden matching engine (combined).
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Check, X as XIcon, Briefcase, RotateCcw } from "lucide-react";
import { toast } from "sonner";
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
import { CloseActiveMatchesTable, type CloseActiveMatch } from "./CloseActiveMatchesTable";
import { cn } from "@/lib/utils";

interface PendingRow {
  id: string;
  kunde_id: string;
  close_lead_id: string;
  close_lead_name: string | null;
  match_confidence: number;
  match_reason: string | null;
  match_type: string | null;
  ai_reasoning: string | null;
  status_category: string | null;
  kunde?: { client_name: string; unternehmen: string | null; vor_nachname: string | null };
}

type FilterType = "all" | "won" | "upsell";

export function CloseMatchingCard() {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [active, setActive] = useState<CloseActiveMatch[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  const load = useCallback(async () => {
    setLoadingActive(true);
    const [{ data: pen }, { data: act }] = await Promise.all([
      supabase
        .from("pending_close_matches")
        .select("id, kunde_id, close_lead_id, close_lead_name, match_confidence, match_reason, match_type, ai_reasoning, status_category")
        .eq("status", "pending")
        .order("match_confidence", { ascending: false }),
      supabase
        .from("kunde_close_deals")
        .select("id, close_lead_id, close_lead_name, match_type, match_confidence, match_reason, date_won, opportunity_value, opportunity_currency, created_at, status_category, kunde:close_deals(id, unternehmen, client_name, vor_nachname)")
        .neq("match_type", "rejected")
        .order("created_at", { ascending: false }),
    ]);

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
    setActive((act || []) as unknown as CloseActiveMatch[]);
    setLoadingActive(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const autoCount = active.filter((m) => ["auto_email", "auto_name", "auto_company", "auto_phone"].includes(m.match_type || "")).length;
  const aiCount = active.filter((m) => m.match_type === "ai_suggested").length;
  const manualCount = active.filter((m) => m.match_type === "manual").length;

  const wonPendingCount = pending.filter((p) => (p.status_category || "won") === "won").length;
  const upsellPendingCount = pending.filter((p) => p.status_category === "upsell").length;

  const filteredPending = useMemo(() => {
    if (filter === "all") return pending;
    return pending.filter((p) => {
      const cat = p.status_category || "won";
      return cat === filter;
    });
  }, [pending, filter]);

  const runMatching = async () => {
    setRunning(true);
    const t = toast.loading("Close Won/Upsell Matching läuft…");
    try {
      const { data, error } = await supabase.functions.invoke("kunden-close-match", {
        body: { trigger: "manual", statusFilter: "won_or_upsell" },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Matching fehlgeschlagen");
      toast.success(
        `Fertig: ${data.auto_matched ?? 0} automatisch · ${data.pending ?? 0} zur Prüfung`,
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
    const t = toast.loading("Auto-Matches werden gelöscht und neu berechnet…");
    try {
      const [{ error: delAuto }, { error: delPending }] = await Promise.all([
        supabase.from("kunde_close_deals").delete()
          .in("match_type", ["auto_email", "auto_name", "auto_company", "auto_phone", "ai_suggested"]),
        supabase.from("pending_close_matches").delete()
          .eq("status", "pending"),
      ]);
      if (delAuto) throw delAuto;
      if (delPending) throw delPending;

      const { data, error } = await supabase.functions.invoke("kunden-close-match", {
        body: { trigger: "manual-rematch", statusFilter: "won_or_upsell" },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Matching fehlgeschlagen");
      toast.success(
        `Neu gematcht: ${data.auto_matched ?? 0} automatisch · ${data.pending ?? 0} zur Prüfung`,
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
    try {
      const { data: opps } = await supabase
        .from("close_opportunities")
        .select("id, lead_id, lead_name, value, value_currency, date_won, status_label")
        .eq("lead_id", row.close_lead_id)
        .limit(1);

      const opp = opps?.[0];
      const category = row.status_category || inferCategory(opp?.status_label);
      const { error } = await supabase.from("kunde_close_deals").insert({
        kunde_id: row.kunde_id,
        close_opportunity_id: opp?.id || row.close_lead_id,
        close_lead_id: row.close_lead_id,
        close_lead_name: row.close_lead_name,
        opportunity_value: opp?.value || null,
        opportunity_currency: opp?.value_currency || "EUR",
        date_won: opp?.date_won || null,
        match_type: row.match_type || "auto_name",
        match_confidence: (row.match_confidence || 0) / 100,
        match_reason: row.match_reason,
        close_status_label: opp?.status_label || (category === "upsell" ? "Upsell" : "Won"),
        status_category: category,
      });
      if (!error) {
        await supabase.from("pending_close_matches").update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        }).eq("id", row.id);
        toast.success("Verknüpfung bestätigt");
        await load();
      } else {
        toast.error("Fehler", { description: error.message });
      }
    } catch (e) {
      toast.error("Fehler", { description: (e as Error).message });
    }
    setBusyId(null);
  };

  const reject = async (row: PendingRow) => {
    setBusyId(row.id);
    await supabase.from("pending_close_matches").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
    }).eq("id", row.id);
    toast.info("Verknüpfung abgelehnt");
    setBusyId(null);
    await load();
  };

  const acceptAllAbove70 = async () => {
    const targets = filteredPending.filter((p) => p.match_confidence >= 70);
    if (targets.length === 0) return;
    const t = toast.loading(`${targets.length} Verknüpfungen werden bestätigt…`);

    let success = 0;
    for (const row of targets) {
      try {
        const { data: opps } = await supabase
          .from("close_opportunities")
          .select("id, lead_id, lead_name, value, value_currency, date_won, status_label")
          .eq("lead_id", row.close_lead_id)
          .limit(1);
        const opp = opps?.[0];
        const category = row.status_category || inferCategory(opp?.status_label);
        const { error } = await supabase.from("kunde_close_deals").upsert({
          kunde_id: row.kunde_id,
          close_opportunity_id: opp?.id || row.close_lead_id,
          close_lead_id: row.close_lead_id,
          close_lead_name: row.close_lead_name,
          opportunity_value: opp?.value || null,
          opportunity_currency: opp?.value_currency || "EUR",
          date_won: opp?.date_won || null,
          match_type: row.match_type || "auto_name",
          match_confidence: (row.match_confidence || 0) / 100,
          match_reason: row.match_reason,
          close_status_label: opp?.status_label || (category === "upsell" ? "Upsell" : "Won"),
          status_category: category,
        }, { onConflict: "kunde_id,close_opportunity_id", ignoreDuplicates: true });
        if (!error) success++;
      } catch { /* skip */ }
    }
    await supabase.from("pending_close_matches").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
    }).in("id", targets.map((t) => t.id));
    toast.success(`${success} bestätigt`, { id: t });
    await load();
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Close Won/Upsell Deals ↔ Kunden
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={runMatching} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
              Jetzt ausführen
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
                  Alle neu
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Alle Matches zurücksetzen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bestehende automatische Matches werden gelöscht und neu ausgeführt. Manuelle
                    Verknüpfungen und Ablehnungen bleiben unberührt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={rematchAll}>Neu matchen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
          <span>{autoCount} automatisch</span>
          <span>·</span>
          <span>{aiCount} via KI</span>
          <span>·</span>
          <span>{manualCount} manuell</span>
          <span>·</span>
          <span>{pending.length} zur Prüfung</span>
          {pending.length > 0 && (
            <>
              <span className="text-muted-foreground/60">
                ({wonPendingCount} Won · {upsellPendingCount} Upsell)
              </span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-6">
        {pending.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              {/* Filter chips */}
              <div className="flex items-center gap-1.5">
                {(["all", "won", "upsell"] as FilterType[]).map((f) => {
                  const count = f === "all" ? pending.length : f === "won" ? wonPendingCount : upsellPendingCount;
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border",
                        filter === f
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-muted/40 border-border text-muted-foreground hover:bg-muted/60",
                      )}
                    >
                      {f === "all" ? `Alle ${count}` : f === "won" ? `🏆 Won ${count}` : `💡 Upsell ${count}`}
                    </button>
                  );
                })}
              </div>
              <Button size="sm" variant="outline" onClick={acceptAllAbove70}>
                Alle ab 70 % bestätigen
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Kunde</th>
                    <th className="text-left font-medium px-3 py-2">Close Lead</th>
                    <th className="text-center font-medium px-2 py-2">Typ</th>
                    <th className="text-right font-medium px-3 py-2">Confidence</th>
                    <th className="text-left font-medium px-3 py-2">Begründung</th>
                    <th className="text-right font-medium px-3 py-2 w-20">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map((row) => {
                    const isUpsell = row.status_category === "upsell";
                    return (
                      <tr key={row.id} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <p className="font-medium text-xs">{getKundeDisplayName(row.kunde)}</p>
                          {row.kunde?.unternehmen ? (
                            <p className="text-[10px] text-muted-foreground">{row.kunde.unternehmen}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-xs">{row.close_lead_name || "–"}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{row.close_lead_id}</p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-[4px] text-[10px] whitespace-nowrap",
                              isUpsell
                                ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                            )}
                          >
                            {isUpsell ? "💡 Upsell" : "🏆 Won"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="outline" className="rounded-[4px] text-[10px] tabular-nums">
                            {Math.round(row.match_confidence)} %
                            {row.match_type === "ai_suggested" && <span className="ml-1">✨</span>}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground max-w-[260px]">
                          {row.ai_reasoning || row.match_reason || "–"}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <CloseActiveMatchesTable matches={active} loading={loadingActive} onChanged={load} />
      </CardContent>
    </Card>
  );
}

function inferCategory(statusLabel?: string | null): string {
  const s = (statusLabel || "").toLowerCase();
  if (s.includes("upsell")) return "upsell";
  if (s.includes("won")) return "won";
  return "won";
}
