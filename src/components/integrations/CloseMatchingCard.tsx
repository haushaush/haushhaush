// Admin card for the Close Leads ↔ Notion-Kunden matching engine.
import { useEffect, useState, useCallback } from "react";
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

interface PendingRow {
  id: string;
  kunde_id: string;
  close_lead_id: string;
  close_lead_name: string | null;
  match_confidence: number;
  match_reason: string | null;
  match_type: string | null;
  ai_reasoning: string | null;
  kunde?: { client_name: string; unternehmen: string | null; vor_nachname: string | null };
}

export function CloseMatchingCard() {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [active, setActive] = useState<CloseActiveMatch[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingActive(true);
    const [{ data: pen }, { data: act }] = await Promise.all([
      supabase
        .from("pending_close_matches")
        .select("id, kunde_id, close_lead_id, close_lead_name, match_confidence, match_reason, match_type, ai_reasoning")
        .eq("status", "pending")
        .order("match_confidence", { ascending: false }),
      supabase
        .from("kunde_close_deals")
        .select("id, close_lead_id, close_lead_name, match_type, match_confidence, match_reason, date_won, opportunity_value, opportunity_currency, created_at, kunde:close_deals(id, unternehmen, client_name, vor_nachname)")
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
  const pendingCount = pending.length;

  const runMatching = async () => {
    setRunning(true);
    const t = toast.loading("Close Matching läuft…");
    try {
      const { data, error } = await supabase.functions.invoke("kunden-close-match", {
        body: { trigger: "manual" },
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
      // Wipe non-manual/non-rejected matches and pending suggestions
      const [{ error: delAuto }, { error: delPending }] = await Promise.all([
        supabase.from("kunde_close_deals").delete().in("match_type", ["auto_email", "auto_name", "auto_company", "auto_phone", "ai_suggested"]),
        supabase.from("pending_close_matches").delete().eq("status", "pending"),
      ]);
      if (delAuto) throw delAuto;
      if (delPending) throw delPending;

      const { data, error } = await supabase.functions.invoke("kunden-close-match", {
        body: { trigger: "manual-rematch" },
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
      // Find the won opportunity for this lead to get the opportunity details
      const { data: opps } = await supabase
        .from("close_opportunities")
        .select("id, lead_id, lead_name, value, value_currency, date_won")
        .eq("lead_id", row.close_lead_id)
        .eq("status_type", "won")
        .limit(1);
      
      const opp = opps?.[0];
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
    const targets = pending.filter((p) => p.match_confidence >= 70);
    if (targets.length === 0) return;
    const t = toast.loading(`${targets.length} Verknüpfungen werden bestätigt…`);
    
    let success = 0;
    for (const row of targets) {
      try {
        const { data: opps } = await supabase
          .from("close_opportunities")
          .select("id, lead_id, lead_name, value, value_currency, date_won")
          .eq("lead_id", row.close_lead_id)
          .eq("status_type", "won")
          .limit(1);
        const opp = opps?.[0];
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
            Close Leads ↔ Kunden Matching
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
          <span>{pendingCount} zur Prüfung</span>
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
                    <th className="text-left font-medium px-3 py-2">Close Lead</th>
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
                        <p className="font-medium text-xs">{row.close_lead_name || "–"}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{row.close_lead_id}</p>
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
                  ))}
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
