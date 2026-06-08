import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/Combobox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Eye, Search, CheckCircle2, AlertTriangle, XCircle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BRANCHE_ALIASES, getCanonicalBranche, getBrancheShortName } from "@/lib/branche-aliases";
import { pickClientId, pickBrancheValue } from "@/lib/showcaseFkSelect";
import { AddBrancheDialog } from "@/components/sales/AddBrancheDialog";
import { useBranchen } from "@/hooks/useBranchen";
import type { MetaAdRow } from "@/pages/sales/ReferenzWerbeanzeigen";

export interface AccountSummary {
  meta_account_id: string;
  meta_account_name: string;
  total: number;
  mit_kunde: number;
  mit_branche: number;
  sampleAdNames: string[];
}

interface ClientRow {
  id: string;
  name: string;
  branche: string | null;
  meta_account_id: string | null;
  meta_account_ids: string[] | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  rows: MetaAdRow[];
  onSaved: () => void;
}

export function buildIncompleteAccounts(rows: MetaAdRow[]): AccountSummary[] {
  const grouped = new Map<string, AccountSummary>();
  for (const ad of rows) {
    const key = ad.meta_account_id || "unknown";
    if (!grouped.has(key)) {
      grouped.set(key, {
        meta_account_id: ad.meta_account_id ?? "",
        meta_account_name: ad.meta_account_name || "(Unbenannt)",
        total: 0,
        mit_kunde: 0,
        mit_branche: 0,
        sampleAdNames: [],
      });
    }
    const acc = grouped.get(key)!;
    acc.total++;
    if (pickClientId(ad as any) || ad.linked_kunde_id) acc.mit_kunde++;
    if (pickBrancheValue(ad as any)) acc.mit_branche++;
    if (acc.sampleAdNames.length < 5) {
      const n = ad.custom_title ?? ad.meta_ad_name;
      if (n && !acc.sampleAdNames.includes(n)) acc.sampleAdNames.push(n);
    }
  }
  return Array.from(grouped.values())
    .filter((a) => a.mit_kunde < a.total || a.mit_branche < a.total)
    .sort((a, b) => b.total - a.total);
}

function StatusCell({ have, total }: { have: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  if (have === total) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
        <CheckCircle2 className="w-3.5 h-3.5" /> {have}/{total}
      </span>
    );
  }
  if (have === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 tabular-nums">
        <XCircle className="w-3.5 h-3.5" /> {have}/{total}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 tabular-nums">
      <AlertTriangle className="w-3.5 h-3.5" /> {have}/{total}
    </span>
  );
}

export function ZuordnenAccountsModal({ open, onClose, rows, onSaved }: Props) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [addBrancheFor, setAddBrancheFor] = useState<string | null>(null);
  const [localBranchen, setLocalBranchen] = useState<string[]>([]);
  const { data: masterBranchen = [] } = useBranchen();

  // Per-account form state
  const [picks, setPicks] = useState<Record<string, { kundeId?: string; kundeName?: string; branche?: string }>>({});

  const incomplete = useMemo(() => buildIncompleteAccounts(rows), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incomplete
      .filter((a) => !completedKeys.has(a.meta_account_id))
      .filter((a) => !q || a.meta_account_name.toLowerCase().includes(q) || (a.meta_account_id || "").toLowerCase().includes(q));
  }, [incomplete, search, completedKeys]);

  useEffect(() => {
    if (!open) return;
    setCompletedKeys(new Set());
    setPicks({});
    setSearch("");
    (async () => {
      setLoadingClients(true);
      const { data, error } = await supabase
        .from("clients" as any)
        .select("id, name, branche, meta_account_id, meta_account_ids")
        .order("name");
      if (error) {
        toast.error("Kunden konnten nicht geladen werden");
        setClients([]);
      } else {
        setClients(((data ?? []) as any[]) as ClientRow[]);
      }
      setLoadingClients(false);
    })();
  }, [open]);

  const handleClose = () => {
    if (completedKeys.size > 0) onSaved();
    onClose();
  };

  const handleSave = async (account: AccountSummary) => {
    const pick = picks[account.meta_account_id] ?? {};
    const kundeId = pick.kundeId?.trim();
    const brancheRaw = pick.branche?.trim();
    const brancheId = brancheRaw || undefined;

    if (!kundeId && !brancheId) {
      toast.warning("Bitte mindestens Kunde oder Branche wählen");
      return;
    }

    setSavingKey(account.meta_account_id);
    try {
      if (kundeId) {
        const { error } = await supabase
          .from("referenz_meta_ads" as any)
          .update({ linked_client_id: kundeId })
          .eq("meta_account_id", account.meta_account_id)
          .is("linked_client_id", null);
        if (error) throw error;
      }
      if (brancheId) {
        const { error } = await supabase
          .from("referenz_meta_ads" as any)
          .update({ linked_branche_id: brancheId })
          .eq("meta_account_id", account.meta_account_id)
          .or("linked_branche_id.is.null,linked_branche_id.eq.");
        if (error) throw error;
      }
      toast.success(`${account.meta_account_name}: Zuordnung gespeichert`);
      // Mark as complete with fade
      setCompletedKeys((s) => new Set(s).add(account.meta_account_id));
      setTimeout(() => {
        toast.success(`${account.meta_account_name} ist jetzt vollständig zugeordnet`);
      }, 250);
    } catch (e: any) {
      toast.error(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSavingKey(null);
    }
  };

  const brancheOptions = useMemo(() => {
    const allRaw = new Set<string>();

    for (const ad of rows) {
      const raw = (ad as any).branche ?? (ad as any).linked_branche_id;
      if (raw?.trim()) allRaw.add(raw.trim());
    }

    for (const c of clients) {
      if (c.branche?.trim()) allRaw.add(c.branche.trim());
    }

    const canonicals = new Set<string>();
    for (const raw of allRaw) {
      canonicals.add(getCanonicalBranche(raw));
    }
    for (const group of BRANCHE_ALIASES) {
      canonicals.add(group.canonical);
    }
    for (const b of localBranchen) {
      if (b?.trim()) canonicals.add(getCanonicalBranche(b.trim()));
    }

    return Array.from(canonicals)
      .sort((a, b) => a.localeCompare(b, "de"))
      .map((canonical) => ({
        value: canonical,
        label: canonical,
        meta: getBrancheShortName(canonical),
      }));
  }, [rows, clients, localBranchen]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Werbeaccounts zuordnen</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {incomplete.length} {incomplete.length === 1 ? "Account hat" : "Accounts haben"} Anzeigen ohne Kunde oder Branche
          </p>
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Account suchen..."
              className="pl-9 h-9"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingClients ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-sm font-medium">Alle Werbeaccounts sind vollständig zugeordnet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Keine Anzeigen ohne Kunde oder Branche gefunden.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="text-left font-medium px-2 py-2">Werbeaccount</th>
                    <th className="text-right font-medium px-2 py-2 w-20">Anzeigen</th>
                    <th className="text-left font-medium px-2 py-2 w-24">Kunde</th>
                    <th className="text-left font-medium px-2 py-2 w-24">Branche</th>
                    <th className="text-left font-medium px-2 py-2 min-w-[200px]">Kunde wählen</th>
                    <th className="text-left font-medium px-2 py-2 min-w-[180px]">Branche wählen</th>
                    <th className="text-right font-medium px-2 py-2 w-32">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((acc) => {
                    const pick = picks[acc.meta_account_id] ?? {};
                    const suggested = clients.find(
                      (c) =>
                        c.meta_account_id === acc.meta_account_id ||
                        (c.meta_account_ids ?? []).includes(acc.meta_account_id),
                    );
                    const clientOptions = clients
                      .slice()
                      .sort((a, b) => {
                        if (suggested) {
                          if (a.id === suggested.id) return -1;
                          if (b.id === suggested.id) return 1;
                        }
                        return a.name.localeCompare(b.name, "de");
                      })
                      .map((c) => ({
                        value: c.id,
                        label: c.name,
                        meta: suggested?.id === c.id ? "Bereits verknüpft" : undefined,
                      }));
                    return (
                      <tr
                        key={acc.meta_account_id || acc.meta_account_name}
                        className="border-b border-border/50 hover:bg-muted/30 transition-opacity"
                      >
                        <td className="px-2 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[200px]">{acc.meta_account_name}</span>
                            {acc.sampleAdNames.length > 0 && (
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-muted-foreground hover:text-foreground">
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <p className="text-xs font-medium mb-1">Beispiel-Anzeigen:</p>
                                    <ul className="text-xs space-y-0.5 list-disc list-inside">
                                      {acc.sampleAdNames.map((n, i) => (
                                        <li key={i} className="truncate">{n}</li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {acc.meta_account_id && (
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{acc.meta_account_id}</p>
                          )}
                        </td>
                        <td className="px-2 py-3 align-middle text-right tabular-nums">{acc.total}</td>
                        <td className="px-2 py-3 align-middle">
                          <StatusCell have={acc.mit_kunde} total={acc.total} />
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <StatusCell have={acc.mit_branche} total={acc.total} />
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <Combobox
                            value={pick.kundeId ?? ""}
                            onChange={(v, label) => {
                              const chosen = clients.find((c) => c.id === v);
                              setPicks((p) => ({
                                ...p,
                                [acc.meta_account_id]: {
                                  ...p[acc.meta_account_id],
                                  kundeId: v || undefined,
                                  kundeName: label,
                                  branche:
                                    p[acc.meta_account_id]?.branche ||
                                    (chosen?.branche ? getCanonicalBranche(chosen.branche) : undefined),
                                },
                              }));
                            }}
                            options={clientOptions}
                            placeholder="Kunde suchen..."
                            allowCreate={false}
                            compact
                          />
                          {suggested && !pick.kundeId && (
                            <button
                              type="button"
                              onClick={() =>
                                setPicks((p) => ({
                                  ...p,
                                  [acc.meta_account_id]: {
                                    ...p[acc.meta_account_id],
                                    kundeId: suggested.id,
                                    kundeName: suggested.name,
                                    branche: p[acc.meta_account_id]?.branche || getCanonicalBranche(suggested.branche) || undefined,
                                  },
                                }))
                              }
                              className="mt-1 text-[10px] text-primary hover:underline"
                            >
                              Vorschlag: {suggested.name}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <Combobox
                            value={pick.branche ?? ""}
                            onChange={(v) =>
                              setPicks((p) => ({
                                ...p,
                                [acc.meta_account_id]: { ...p[acc.meta_account_id], branche: v || undefined },
                              }))
                            }
                            options={brancheOptions}
                            placeholder="Branche..."
                            allowCreate={false}
                            compact
                            onAddNew={() => setAddBrancheFor(acc.meta_account_id)}
                            addNewLabel="Branche hinzufügen"
                          />
                        </td>
                        <td className="px-2 py-3 align-middle text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingKey === acc.meta_account_id || (!pick.kundeId && !pick.branche)}
                            onClick={() => handleSave(acc)}
                          >
                            {savingKey === acc.meta_account_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            Speichern
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {completedKeys.size > 0 && (
              <span>
                <Badge variant="secondary" className="mr-1">{completedKeys.size}</Badge>
                Account{completedKeys.size === 1 ? "" : "s"} in dieser Session gespeichert
              </span>
            )}
          </div>
          <Button variant="ghost" onClick={handleClose}>Schließen</Button>
        </div>
      </DialogContent>

      <AddBrancheDialog
        open={!!addBrancheFor}
        onClose={() => setAddBrancheFor(null)}
        existingBranchen={brancheOptions.map((o) => o.value)}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        onCreated={(branche) => {
          const canonical = getCanonicalBranche(branche);
          setLocalBranchen((prev) =>
            prev.some((b) => b.toLowerCase() === canonical.toLowerCase()) ? prev : [...prev, canonical],
          );
          if (addBrancheFor) {
            setPicks((p) => ({
              ...p,
              [addBrancheFor]: { ...p[addBrancheFor], branche: canonical },
            }));
          }
          setAddBrancheFor(null);
        }}
      />
    </Dialog>
  );
}
