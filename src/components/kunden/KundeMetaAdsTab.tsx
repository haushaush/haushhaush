// Meta Ads tab inside the Kunden slide-in panel.
// Shows linked ad accounts + KPI bar + per-account performance for a date preset.
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, ExternalLink, Plus, Sparkles, Wand2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { useMetaAds, DATE_PRESETS, type DatePreset } from "@/contexts/MetaAdsContext";
import { cn } from "@/lib/utils";

const LEAD_PRIORITY = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "leadgen.other",
];

function priorityActionValue(actions: any[] | undefined, priority: string[]): number {
  if (!Array.isArray(actions)) return 0;
  for (const t of priority) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return parseFloat(a.value) || 0;
  }
  return 0;
}

function fmtEUR(v: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtNum(v: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v);
}

interface MatchRow {
  id: string;
  meta_account_id: string;
  meta_account_name: string | null;
  match_type: "manual" | "auto" | "ai";
  match_confidence: number | null;
}

interface AccountInsights {
  spend: number;
  leads: number;
  cpl: number;
  active_campaigns: number;
  total_campaigns: number;
  currency: string;
  status?: number;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  spend: number;
  leads: number;
  cpl: number;
}

export function KundeMetaAdsTab({
  kundeId,
  matches,
  onMatchesChange,
}: {
  kundeId: string;
  matches: MatchRow[];
  onMatchesChange: () => void;
}) {
  const navigate = useNavigate();
  const { accounts, datePreset, setDatePreset, callMeta } = useMetaAds();
  const [insights, setInsights] = useState<Record<string, AccountInsights>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [campaigns, setCampaigns] = useState<Record<string, CampaignRow[]>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MatchRow | null>(null);

  const accountById = useMemo(() => {
    const m = new Map<string, any>();
    accounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [accounts]);

  // Fetch insights for every linked account at the selected date preset
  const fetchAllInsights = useCallback(async () => {
    if (matches.length === 0) return;
    setLoading(true);
    const acc: Record<string, AccountInsights> = {};
    await Promise.all(
      matches.map(async (m) => {
        const meta = accountById.get(m.meta_account_id);
        const currency = meta?.currency || "EUR";
        try {
          const [insRes, campRes] = await Promise.all([
            callMeta<any>(`/${m.meta_account_id}/insights`, {
              fields: "spend,actions",
              date_preset: datePreset,
              level: "account",
            }),
            callMeta<any>(`/${m.meta_account_id}/campaigns`, {
              fields: "id,status",
              limit: 500,
            }),
          ]);
          const row = insRes?.data?.[0] || {};
          const spend = parseFloat(row.spend || "0");
          const leads = priorityActionValue(row.actions, LEAD_PRIORITY);
          const camps = campRes?.data || [];
          const active = camps.filter((c: any) => c.status === "ACTIVE").length;
          acc[m.meta_account_id] = {
            spend,
            leads,
            cpl: leads > 0 ? spend / leads : 0,
            active_campaigns: active,
            total_campaigns: camps.length,
            currency,
            status: meta?.account_status,
          };
        } catch (e) {
          console.warn("insights failed", m.meta_account_id, (e as Error).message);
          acc[m.meta_account_id] = {
            spend: 0, leads: 0, cpl: 0, active_campaigns: 0, total_campaigns: 0,
            currency, status: meta?.account_status,
          };
        }
      }),
    );
    setInsights(acc);
    setLoading(false);
  }, [matches, datePreset, callMeta, accountById]);

  useEffect(() => {
    fetchAllInsights();
  }, [fetchAllInsights]);

  // KPI bar totals
  const totals = useMemo(() => {
    let spend = 0, leads = 0, active = 0;
    Object.values(insights).forEach((i) => {
      spend += i.spend;
      leads += i.leads;
      active += i.active_campaigns;
    });
    return { spend, leads, cpl: leads > 0 ? spend / leads : 0, active };
  }, [insights]);

  const toggleExpand = async (m: MatchRow) => {
    const next = !expanded[m.meta_account_id];
    setExpanded((p) => ({ ...p, [m.meta_account_id]: next }));
    if (next && !campaigns[m.meta_account_id]) {
      try {
        const res = await callMeta<any>(`/${m.meta_account_id}/campaigns`, {
          fields:
            "id,name,status,insights.date_preset(" + datePreset + "){spend,actions}",
          limit: 50,
        });
        const rows: CampaignRow[] = (res?.data || []).map((c: any) => {
          const ins = c.insights?.data?.[0] || {};
          const spend = parseFloat(ins.spend || "0");
          const leads = priorityActionValue(ins.actions, LEAD_PRIORITY);
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            spend,
            leads,
            cpl: leads > 0 ? spend / leads : 0,
          };
        });
        rows.sort((a, b) => b.spend - a.spend);
        setCampaigns((p) => ({ ...p, [m.meta_account_id]: rows.slice(0, 5) }));
      } catch (e) {
        toast.error("Kampagnen konnten nicht geladen werden");
      }
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    const { error } = await supabase
      .from("kunde_meta_accounts")
      .delete()
      .eq("id", removeTarget.id);
    if (error) {
      toast.error("Verknüpfung konnte nicht entfernt werden");
      return;
    }
    // Add to rejected so the matcher won't re-suggest it
    await supabase.from("rejected_meta_matches").insert({
      kunde_id: kundeId,
      meta_account_id: removeTarget.meta_account_id,
    });
    toast.success("Verknüpfung entfernt");
    setRemoveTarget(null);
    onMatchesChange();
  };

  const matchTypeBadge = (m: MatchRow) => {
    if (m.match_type === "auto") {
      return (
        <Badge variant="outline" className="rounded-[4px] text-[10px] gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <Wand2 className="h-3 w-3" /> Auto {Math.round(m.match_confidence ?? 0)}%
        </Badge>
      );
    }
    if (m.match_type === "ai") {
      return (
        <Badge variant="outline" className="rounded-[4px] text-[10px] gap-1 border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3 w-3" /> KI {Math.round(m.match_confidence ?? 0)}%
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="rounded-[4px] text-[10px] border-primary/30 bg-primary/10 text-primary">
        ✓ Manuell
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold">
          Verknüpfte Werbekonten <span className="text-muted-foreground font-normal">({matches.length})</span>
        </h3>
        <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Gesamtausgaben" value={loading ? null : fmtEUR(totals.spend)} />
        <KpiCard label="Leads" value={loading ? null : fmtNum(totals.leads)} />
        <KpiCard
          label="Cost per Lead"
          value={loading ? null : totals.leads > 0 ? fmtEUR(totals.cpl) : "–"}
        />
        <KpiCard label="Aktive Kampagnen" value={loading ? null : fmtNum(totals.active)} />
      </div>

      {/* Per-account cards */}
      <div className="space-y-3">
        {matches.map((m) => {
          const meta = accountById.get(m.meta_account_id);
          const ins = insights[m.meta_account_id];
          const isOpen = expanded[m.meta_account_id];
          const isActive = ins?.status === 1;
          return (
            <div
              key={m.id}
              className="border border-border rounded-lg p-4 bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {meta?.name || m.meta_account_name || m.meta_account_id}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {m.meta_account_id}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-[4px] text-[10px]",
                        isActive
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-muted-foreground/20 bg-muted text-muted-foreground",
                      )}
                    >
                      {isActive ? "Active" : "Inactive"}
                    </Badge>
                    {matchTypeBadge(m)}
                    {ins?.currency && (
                      <span className="text-[10px] text-muted-foreground">{ins.currency}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setRemoveTarget(m)}
                  className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                  title="Verknüpfung entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Stat label="Ausgaben" value={ins ? fmtEUR(ins.spend, ins.currency) : null} />
                <Stat label="Leads" value={ins ? fmtNum(ins.leads) : null} />
                <Stat label="CPL" value={ins ? (ins.leads > 0 ? fmtEUR(ins.cpl, ins.currency) : "–") : null} />
                <Stat
                  label="Kampagnen"
                  value={ins ? `${ins.active_campaigns} aktiv / ${ins.total_campaigns}` : null}
                />
              </div>

              <button
                onClick={() => toggleExpand(m)}
                className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Top 5 Kampagnen {isOpen ? "verbergen" : "anzeigen"}
              </button>

              {isOpen && (
                <div className="mt-3 -mx-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        <th className="text-left font-medium px-2 py-1.5">Name</th>
                        <th className="text-left font-medium px-2 py-1.5">Status</th>
                        <th className="text-right font-medium px-2 py-1.5">Spend</th>
                        <th className="text-right font-medium px-2 py-1.5">Leads</th>
                        <th className="text-right font-medium px-2 py-1.5">CPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!campaigns[m.meta_account_id] && (
                        <tr><td colSpan={5} className="px-2 py-2"><Skeleton className="h-4 w-full" /></td></tr>
                      )}
                      {(campaigns[m.meta_account_id] || []).map((c) => (
                        <tr key={c.id} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-2 py-1.5 truncate max-w-[180px]">{c.name}</td>
                          <td className="px-2 py-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-[4px] text-[10px]",
                                c.status === "ACTIVE"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border-muted-foreground/20 bg-muted text-muted-foreground",
                              )}
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmtEUR(c.spend, ins?.currency)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(c.leads)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{c.leads > 0 ? fmtEUR(c.cpl, ins?.currency) : "–"}</td>
                        </tr>
                      ))}
                      {campaigns[m.meta_account_id]?.length === 0 && (
                        <tr><td colSpan={5} className="px-2 py-2 text-center text-muted-foreground">Keine Kampagnen</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Weiteres Konto verknüpfen
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (matches[0]) {
              navigate(`/meta/kampagnen?account=${matches[0].meta_account_id}`);
            } else {
              navigate("/meta/kampagnen");
            }
          }}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> In Ads Manager öffnen
        </Button>
      </div>

      {/* Manual link modal */}
      <ManualLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        kundeId={kundeId}
        onLinked={() => { onMatchesChange(); setLinkOpen(false); }}
      />

      {/* Remove confirmation */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Verknüpfung entfernen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Die Verknüpfung zu <strong>{removeTarget?.meta_account_name || removeTarget?.meta_account_id}</strong> wird aufgehoben.
            Das Konto wird beim automatischen Matching nicht erneut diesem Kunden zugeordnet.
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setRemoveTarget(null)}>Abbrechen</Button>
            <Button variant="destructive" size="sm" onClick={handleRemove}>Entfernen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{label}</p>
      {value === null ? (
        <Skeleton className="h-6 w-20 mt-1" />
      ) : (
        <p className="text-base font-semibold tabular-nums mt-0.5">{value}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{label}</p>
      {value === null ? (
        <Skeleton className="h-4 w-16 mt-1" />
      ) : (
        <p className="text-sm font-medium tabular-nums mt-0.5">{value}</p>
      )}
    </div>
  );
}

function ManualLinkModal({
  open, onClose, kundeId, onLinked,
}: {
  open: boolean;
  onClose: () => void;
  kundeId: string;
  onLinked: () => void;
}) {
  const { accounts, loadingAccounts } = useMetaAds();
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("kunde_meta_accounts")
      .select("meta_account_id")
      .then(({ data }) => setTaken(new Set((data || []).map((d: any) => d.meta_account_id))));
  }, [open]);

  const available = useMemo(() => {
    const s = search.toLowerCase();
    return accounts
      .filter((a) => !taken.has(a.id))
      .filter((a) =>
        !s ||
        a.name?.toLowerCase().includes(s) ||
        a.id.toLowerCase().includes(s),
      );
  }, [accounts, taken, search]);

  const handlePick = async (acc: any) => {
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("kunde_meta_accounts").insert({
      kunde_id: kundeId,
      meta_account_id: acc.id,
      meta_account_name: acc.name,
      match_type: "manual",
      match_confidence: 100,
      matched_by: u?.user?.id || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Verknüpfung fehlgeschlagen", { description: error.message });
      return;
    }
    // If this account was in pending or rejected, clean up
    await supabase.from("pending_meta_matches").delete().eq("meta_account_id", acc.id);
    await supabase.from("rejected_meta_matches").delete()
      .eq("meta_account_id", acc.id).eq("kunde_id", kundeId);
    toast.success("Werbekonto verknüpft");
    onLinked();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Werbekonto verknüpfen</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Nach Name oder ID suchen…"
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[400px] overflow-y-auto -mx-2 border-t border-border">
          {loadingAccounts && (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}
          {!loadingAccounts && available.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Keine freien Werbekonten</p>
          )}
          {available.map((a) => (
            <button
              key={a.id}
              disabled={submitting}
              onClick={() => handlePick(a)}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3 border-b border-border/50 last:border-0 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{a.name}</p>
                <p className="text-[11px] font-mono text-muted-foreground">{a.id}</p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{a.currency || ""}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
