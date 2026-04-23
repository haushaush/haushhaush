// Active matches table for the Meta ↔ Notion Kunden matching admin card.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Search,
  Download,
  Link2Off,
  X as XIcon,
  ChevronUp,
  ChevronDown,
  Bot,
  Sparkles,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getKundeDisplayName } from "@/lib/kunde-display-name";

export interface ActiveMatch {
  id: string;
  meta_account_id: string;
  meta_account_name: string | null;
  match_type: "auto" | "ai" | "manual" | string;
  match_confidence: number | null;
  matched_at: string;
  matched_by: string | null;
  kunde: {
    id: string;
    unternehmen: string | null;
    client_name: string;
    vor_nachname: string | null;
  } | null;
}

type FilterKey = "all" | "auto" | "ai" | "manual";
type SortKey = "kunde" | "account" | "type" | "confidence" | "matched_at";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  if (hr < 24) return `vor ${hr} Std.`;
  if (day < 30) return `vor ${day} Tag${day === 1 ? "" : "en"}`;
  const month = Math.round(day / 30);
  if (month < 12) return `vor ${month} Monat${month === 1 ? "" : "en"}`;
  const year = Math.round(day / 365);
  return `vor ${year} Jahr${year === 1 ? "" : "en"}`;
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function MatchTypeBadge({ type }: { type: string }) {
  if (type === "auto") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] bg-teal-500/15 text-teal-600 dark:text-teal-400 px-2 py-0.5 text-[10px] font-medium">
        <Bot className="h-3 w-3" /> Auto
      </span>
    );
  }
  if (type === "ai") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] bg-purple-500/15 text-purple-600 dark:text-purple-400 px-2 py-0.5 text-[10px] font-medium">
        <Sparkles className="h-3 w-3" /> KI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
      <Check className="h-3 w-3" /> Manuell
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium select-none cursor-pointer hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

interface Props {
  matches: ActiveMatch[];
  loading: boolean;
  onChanged: () => void;
}

export function MetaActiveMatchesTable({ matches, loading, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("matched_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [removeTarget, setRemoveTarget] = useState<ActiveMatch | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset page when filter/search changes
  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = matches;
    if (filter !== "all") rows = rows.filter((m) => m.match_type === filter);
    if (q) {
      rows = rows.filter((m) => {
        const kundeName = getKundeDisplayName(m.kunde).toLowerCase();
        const accountName = (m.meta_account_name || "").toLowerCase();
        const accountId = (m.meta_account_id || "").toLowerCase();
        return kundeName.includes(q) || accountName.includes(q) || accountId.includes(q);
      });
    }
    const sorted = [...rows].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "kunde":
          av = getKundeDisplayName(a.kunde).toLowerCase();
          bv = getKundeDisplayName(b.kunde).toLowerCase();
          break;
        case "account":
          av = (a.meta_account_name || "").toLowerCase();
          bv = (b.meta_account_name || "").toLowerCase();
          break;
        case "type":
          av = a.match_type;
          bv = b.match_type;
          break;
        case "confidence":
          av = a.match_confidence ?? -1;
          bv = b.match_confidence ?? -1;
          break;
        case "matched_at":
        default:
          av = new Date(a.matched_at).getTime();
          bv = new Date(b.matched_at).getTime();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [matches, search, filter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "matched_at" || k === "confidence" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Kunde",
      "Kunde ID",
      "Meta Account Name",
      "Meta Account ID",
      "Match-Typ",
      "Confidence",
      "Verknuepft am",
    ];
    const rows = filtered.map((m) => [
      getKundeDisplayName(m.kunde),
      m.kunde?.id || "",
      m.meta_account_name || "",
      m.meta_account_id,
      m.match_type,
      m.match_confidence != null ? `${Math.round(m.match_confidence)}%` : "",
      new Date(m.matched_at).toLocaleString("de-DE"),
    ]);
    const escape = (v: string) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(escape).join(";")).join("\n");
    // BOM for Excel UTF-8
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meta-matches-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error: delErr } = await supabase
        .from("kunde_meta_accounts")
        .delete()
        .eq("id", removeTarget.id);
      if (delErr) throw delErr;
      if (removeTarget.kunde?.id) {
        await supabase.from("rejected_meta_matches").insert({
          kunde_id: removeTarget.kunde.id,
          meta_account_id: removeTarget.meta_account_id,
          rejected_by: u?.user?.id || null,
        });
      }
      toast.success("Verknüpfung entfernt");
      onChanged();
    } catch (e) {
      toast.error("Fehler beim Entfernen", { description: (e as Error).message });
    } finally {
      setBusy(false);
      setRemoveTarget(null);
    }
  };

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "auto", label: "🤖 Auto" },
    { key: "ai", label: "✨ KI" },
    { key: "manual", label: "✓ Manuell" },
  ];

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold">
          Aktive Verknüpfungen <span className="text-muted-foreground font-normal">({matches.length})</span>
        </h4>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen…"
              className="h-8 pl-7 w-48 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5">
            {filterChips.map((c) => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={cn(
                  "px-2.5 py-1 rounded-[4px] text-[11px] font-medium transition-colors",
                  filter === c.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table or empty state */}
      {loading ? (
        <div className="text-xs text-muted-foreground py-6 text-center">Lädt…</div>
      ) : matches.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-10 px-6 text-center">
          <Link2Off className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
          <p className="text-sm font-medium">Noch keine Verknüpfungen</p>
          <p className="text-xs text-muted-foreground mt-1">
            Klick oben auf „Jetzt ausführen" um das automatische Matching zu starten
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-8 px-6 text-center">
          <p className="text-xs text-muted-foreground">Keine Treffer für die aktuellen Filter</p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground/80 sticky top-0 z-10">
                  <tr>
                    <SortHeader label="Kunde" sortKey="kunde" active={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader
                      label="Meta Account"
                      sortKey="account"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortHeader label="Match-Typ" sortKey="type" active={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader
                      label="Confidence"
                      sortKey="confidence"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortHeader
                      label="Verknüpft am"
                      sortKey="matched_at"
                      active={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="px-3 py-2 text-right font-medium w-16">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-border/50 hover:bg-muted/30"
                      style={{ height: 40 }}
                    >
                      <td className="px-3 py-1.5">
                        {row.kunde ? (
                          <Link
                            to={`/kunden?kunde=${row.kunde.id}&tab=meta-ads`}
                            className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
                          >
                            {getKundeDisplayName(row.kunde)}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <p className="text-xs font-medium leading-tight">{row.meta_account_name || "–"}</p>
                        <p className="text-[10px] font-mono text-muted-foreground leading-tight">
                          {row.meta_account_id}
                        </p>
                      </td>
                      <td className="px-3 py-1.5">
                        <MatchTypeBadge type={row.match_type} />
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                        {row.match_type === "manual" || row.match_confidence == null
                          ? "—"
                          : `${Math.round(row.match_confidence)}%`}
                      </td>
                      <td className="px-3 py-1.5">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground cursor-default">
                                {relativeTime(row.matched_at)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{fullDate(row.matched_at)}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => setRemoveTarget(row)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Verknüpfung entfernen"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    className={cn(page === 1 && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                  // simple windowing
                  let pageNum = i + 1;
                  if (totalPages > 7) {
                    const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                    pageNum = start + i;
                  }
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        href="#"
                        isActive={pageNum === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(pageNum);
                        }}
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                    className={cn(page === totalPages && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknüpfung entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Verknüpfung zwischen{" "}
              <span className="font-medium text-foreground">
                {getKundeDisplayName(removeTarget?.kunde)}
              </span>{" "}
              und{" "}
              <span className="font-medium text-foreground">{removeTarget?.meta_account_name}</span> wird
              gelöscht. Das Konto wird beim nächsten automatischen Matching nicht erneut vorgeschlagen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRemove();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Entferne…" : "Entfernen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
