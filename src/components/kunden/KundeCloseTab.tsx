import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExternalLink, RefreshCw, Search, X, Briefcase, Trophy, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CloseMatch {
  id: string;
  kunde_id: string;
  close_opportunity_id: string;
  close_lead_id: string;
  close_lead_name: string | null;
  opportunity_value: number | null;
  opportunity_currency: string | null;
  date_won: string | null;
  match_type: string;
  match_confidence: number | null;
  match_reason: string | null;
  status_category?: string | null;
  close_status_label?: string | null;
}

function fmtEUR(v: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(v: string | null) {
  if (!v) return "–";
  try {
    return new Date(v).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return v;
  }
}

export function KundeCloseTab({
  kundeId,
  matches,
  onMatchesChange,
}: {
  kundeId: string;
  matches: CloseMatch[];
  onMatchesChange: () => void;
}) {
  const [matching, setMatching] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CloseMatch | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const activeMatches = matches.filter((m) => m.match_type !== "rejected");
  const wonMatches = activeMatches.filter((m) => (m.status_category || "won") === "won");
  const upsellMatches = activeMatches.filter((m) => m.status_category === "upsell");

  const totalValue = wonMatches.reduce(
    (sum, m) => sum + (m.opportunity_value || 0),
    0,
  );

  const runMatch = async () => {
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "kunden-close-match",
        { body: { kundeId } },
      );
      if (error) throw error;
      toast.success(
        `Matching abgeschlossen: ${data.matched || data.auto_matched || 0} neue Treffer`,
      );
      onMatchesChange();
    } catch (e: any) {
      toast.error(`Matching fehlgeschlagen: ${e.message}`);
    } finally {
      setMatching(false);
    }
  };

  const rejectMatch = async (match: CloseMatch) => {
    const { error } = await supabase
      .from("kunde_close_deals" as any)
      .update({ match_type: "rejected" } as any)
      .eq("id", match.id);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success("Match entfernt");
    onMatchesChange();
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    await rejectMatch(removeTarget);
    setRemoveTarget(null);
  };

  if (activeMatches.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 text-center min-h-[300px]">
        <Briefcase className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Keine Close-Deals verknüpft</p>
          <p className="text-xs text-muted-foreground mt-1">
            Klicke auf "Matching starten", um automatisch Deals
            zuzuordnen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runMatch}
            disabled={matching}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 mr-1.5", matching && "animate-spin")}
            />
            Matching starten
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            + Manuell verknüpfen
          </Button>
        </div>
        <ManualLinkModal
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          kundeId={kundeId}
          existingOppIds={matches.map((m) => m.close_opportunity_id)}
          onLinked={() => {
            onMatchesChange();
            setLinkOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold">
          Close-Verknüpfungen{" "}
          <span className="text-muted-foreground font-normal">
            ({activeMatches.length})
          </span>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={runMatch}
          disabled={matching}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 mr-1.5", matching && "animate-spin")}
          />
          Re-Match
        </Button>
      </div>

      {/* Upsell section — shown FIRST because it's actionable for sales */}
      {upsellMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <h4 className="font-semibold text-sm">
              💡 Upsell-Bereit ({upsellMatches.length})
            </h4>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Dieser Kunde wurde in Close als Upsell-Kandidat markiert.
              Guter Zeitpunkt für ein Cross-Sell-Gespräch.
            </p>
          </div>
          <div className="space-y-3">
            {upsellMatches.map((match) => (
              <DealCard
                key={match.id}
                match={match}
                variant="upsell"
                onRemove={() => setRemoveTarget(match)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Won section */}
      {wonMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h4 className="font-semibold text-sm">
              ✅ Gewonnene Deals ({wonMatches.length})
            </h4>
          </div>
          {/* KPI summary */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Gewonnene Deals"
              value={String(wonMatches.length)}
            />
            <KpiCard
              label="Gesamtwert"
              value={totalValue > 0 ? fmtEUR(totalValue) : "–"}
            />
          </div>
          <div className="space-y-3">
            {wonMatches.map((match) => (
              <DealCard
                key={match.id}
                match={match}
                variant="won"
                onRemove={() => setRemoveTarget(match)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLinkOpen(true)}
        >
          + Manuell verknüpfen
        </Button>
      </div>

      {/* Manual link modal */}
      <ManualLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        kundeId={kundeId}
        existingOppIds={matches.map((m) => m.close_opportunity_id)}
        onLinked={() => {
          onMatchesChange();
          setLinkOpen(false);
        }}
      />

      {/* Remove confirmation */}
      <Dialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Verknüpfung entfernen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Die Verknüpfung zu{" "}
            <strong>
              {removeTarget?.close_lead_name || removeTarget?.close_lead_id}
            </strong>{" "}
            wird aufgehoben und beim automatischen Matching nicht erneut
            zugeordnet.
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemoveTarget(null)}
            >
              Abbrechen
            </Button>
            <Button variant="destructive" size="sm" onClick={handleRemove}>
              Entfernen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DealCard({
  match,
  variant,
  onRemove,
}: {
  match: CloseMatch;
  variant: "won" | "upsell";
  onRemove: () => void;
}) {
  const isUpsell = variant === "upsell";
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isUpsell ? (
              <TrendingUp className="h-4 w-4 text-blue-500 shrink-0" />
            ) : (
              <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <p className="font-semibold text-sm truncate">
              {match.close_lead_name || match.close_lead_id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-[4px] text-[10px]",
                isUpsell
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {isUpsell ? "Upsell" : "Won"}
            </Badge>
            <MatchTypeBadge match={match} />
            {match.date_won && (
              <span className="text-[10px] text-muted-foreground">
                {fmtDate(match.date_won)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
          title="Verknüpfung entfernen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isUpsell && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              Deal-Wert
            </p>
            <p className="text-sm font-medium tabular-nums mt-0.5">
              {match.opportunity_value
                ? fmtEUR(match.opportunity_value, match.opportunity_currency || "EUR")
                : "–"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              Gewonnen am
            </p>
            <p className="text-sm font-medium mt-0.5">
              {fmtDate(match.date_won)}
            </p>
          </div>
        </div>
      )}

      {match.match_reason && (
        <p className="text-[11px] text-muted-foreground mt-3 border-t border-border/50 pt-2">
          {match.match_reason}
        </p>
      )}
    </div>
  );
}

function MatchTypeBadge({ match }: { match: CloseMatch }) {
  const conf = Math.round(match.match_confidence ?? 0);
  if (match.match_type === "manual") {
    return (
      <Badge
        variant="outline"
        className="rounded-[4px] text-[10px] border-primary/30 bg-primary/10 text-primary"
      >
        ✓ Manuell
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="rounded-[4px] text-[10px] gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    >
      Auto {conf}%
    </Badge>
  );
}

function KpiCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      {value === null ? (
        <Skeleton className="h-6 w-20 mt-1" />
      ) : (
        <p className="text-base font-semibold tabular-nums mt-0.5">{value}</p>
      )}
    </div>
  );
}

function ManualLinkModal({
  open,
  onClose,
  kundeId,
  existingOppIds,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  kundeId: string;
  existingOppIds: string[];
  onLinked: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const doSearch = useCallback(async () => {
    if (search.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("close_opportunities")
      .select("id, lead_id, lead_name, value, value_currency, date_won, status_type, status_label")
      .ilike("lead_name", `%${search}%`)
      .limit(20);
    setResults(
      (data || []).filter((o: any) => !existingOppIds.includes(o.id)),
    );
    setLoading(false);
  }, [search, existingOppIds]);

  useEffect(() => {
    const t = setTimeout(doSearch, 300);
    return () => clearTimeout(t);
  }, [doSearch]);

  const inferCategory = (statusType?: string, statusLabel?: string): string => {
    if (statusType === "won") return "won";
    if ((statusLabel || "").toLowerCase().includes("upsell")) return "upsell";
    return "won";
  };

  const linkOpp = async (opp: any) => {
    setSubmitting(true);
    const category = inferCategory(opp.status_type, opp.status_label);
    const { error } = await supabase.from("kunde_close_deals" as any).insert({
      kunde_id: kundeId,
      close_opportunity_id: opp.id,
      close_lead_id: opp.lead_id || "",
      close_lead_name: opp.lead_name,
      opportunity_value: opp.value,
      opportunity_currency: opp.value_currency || "EUR",
      date_won: opp.date_won,
      match_type: "manual",
      match_confidence: 1.0,
      match_reason: "Manuell verknüpft",
      close_status_label: opp.status_label || opp.status_type || "Won",
      status_category: category,
    } as any);
    setSubmitting(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success("Deal verknüpft");
    onLinked();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close-Deal manuell verknüpfen</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nach Lead-Name suchen…"
            className="pl-9"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto space-y-1 mt-2">
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {!loading && results.length === 0 && search.length >= 2 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine Deals gefunden
            </p>
          )}
          {results.map((opp) => {
            const isUpsell = (opp.status_label || "").toLowerCase().includes("upsell");
            return (
              <button
                key={opp.id}
                onClick={() => linkOpp(opp)}
                disabled={submitting}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-md border border-border hover:bg-muted/60 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{opp.lead_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {opp.status_type || opp.status_label || "–"}{" "}
                    {opp.date_won
                      ? new Date(opp.date_won).toLocaleDateString("de-DE")
                      : ""}
                    {opp.value
                      ? ` · ${new Intl.NumberFormat("de-DE", { style: "currency", currency: opp.value_currency || "EUR", maximumFractionDigits: 0 }).format(opp.value)}`
                      : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-[4px] text-[10px] shrink-0",
                    isUpsell
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-700"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
                  )}
                >
                  {isUpsell ? "Upsell" : "Won"}
                </Badge>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
