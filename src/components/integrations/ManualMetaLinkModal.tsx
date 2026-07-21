import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getKundeDisplayName } from "@/lib/kunde-display-name";

interface Kunde {
  id: string;
  client_name: string;
  unternehmen: string | null;
  vor_nachname: string | null;
}
interface MetaAccount {
  meta_account_id: string;
  name: string | null;
  business_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function ManualMetaLinkModal({ open, onOpenChange, onSaved }: Props) {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kundeSearch, setKundeSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedKunde, setSelectedKunde] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedKunde(null);
    setSelectedAccount(null);
    setKundeSearch("");
    setAccountSearch("");
    void load();
  }, [open]);

  const load = async () => {
    setLoading(true);
    try {
      const [kRes, cacheRes, linkedRes] = await Promise.all([
        supabase
          .from("close_deals")
          .select("id, client_name, unternehmen, vor_nachname")
          .order("client_name", { ascending: true })
          .limit(10000),
        supabase
          .from("meta_accounts_cache")
          .select("meta_account_id, name, business_name")
          .order("name", { ascending: true })
          .limit(10000),
        supabase.from("kunde_meta_accounts").select("meta_account_id").limit(10000),
      ]);
      setKunden((kRes.data || []) as Kunde[]);

      const byId = new Map<string, MetaAccount>();
      for (const a of (cacheRes.data || []) as MetaAccount[]) byId.set(a.meta_account_id, a);
      // Merge business/client accounts (matches MetaAccountAssignModal)
      try {
        const { data: biz } = await supabase.functions.invoke("list-meta-ad-accounts", { body: {} });
        for (const a of ((biz as any)?.accounts || [])) {
          const id: string = a.id || a.meta_account_id || (a.account_id ? `act_${a.account_id}` : "");
          if (!id) continue;
          const prev = byId.get(id);
          byId.set(id, {
            meta_account_id: id,
            name: a.name ?? prev?.name ?? null,
            business_name: a.business_name ?? prev?.business_name ?? null,
          });
        }
      } catch { /* fall back to cache */ }
      setAccounts(
        Array.from(byId.values()).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      );
      setLinkedIds(new Set((linkedRes.data || []).map((r: any) => r.meta_account_id)));
    } catch (e: any) {
      toast.error("Laden fehlgeschlagen: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };

  const filteredKunden = useMemo(() => {
    const q = kundeSearch.trim().toLowerCase();
    if (!q) return kunden;
    return kunden.filter((k) => {
      const name = getKundeDisplayName(k).toLowerCase();
      return name.includes(q) || (k.unternehmen || "").toLowerCase().includes(q);
    });
  }, [kunden, kundeSearch]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    const qId = q.replace(/^act_/, "");
    return accounts.filter((a) => {
      const name = (a.name || "").toLowerCase();
      const id = a.meta_account_id.toLowerCase();
      return name.includes(q) || id.includes(q) || id.replace(/^act_/, "").includes(qId);
    });
  }, [accounts, accountSearch]);

  const save = async () => {
    if (!selectedKunde || !selectedAccount) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const acc = accounts.find((a) => a.meta_account_id === selectedAccount);
      const { error } = await supabase
        .from("kunde_meta_accounts")
        .upsert(
          {
            kunde_id: selectedKunde,
            meta_account_id: selectedAccount,
            meta_account_name: acc?.name || null,
            match_type: "manual",
            match_confidence: null,
            matched_by: u?.user?.id || null,
          },
          { onConflict: "meta_account_id" },
        );
      if (error) throw error;
      // Remove any pending suggestion for that account
      await supabase.from("pending_meta_matches").delete().eq("meta_account_id", selectedAccount);
      toast.success("Manuell verknüpft");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Speichern fehlgeschlagen: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Manuell verknüpfen
          </DialogTitle>
          <DialogDescription>
            Kunde und Meta-Werbekonto auswählen und verknüpfen.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Wird geladen…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
            {/* Kunden */}
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Kunde ({filteredKunden.length})
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Kunde suchen…"
                  className="pl-9 h-9"
                  value={kundeSearch}
                  onChange={(e) => setKundeSearch(e.target.value)}
                />
              </div>
              <div className="flex-1 overflow-auto border border-border rounded-md">
                {filteredKunden.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">Keine Kunden.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredKunden.map((k) => (
                      <li
                        key={k.id}
                        onClick={() => setSelectedKunde(k.id)}
                        className={cn(
                          "px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm",
                          selectedKunde === k.id && "bg-primary/10",
                        )}
                      >
                        <div className="font-medium truncate">{getKundeDisplayName(k)}</div>
                        {k.unternehmen && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {k.unternehmen}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Meta Accounts */}
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Meta-Werbekonto ({filteredAccounts.length})
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Account suchen (Name oder act_…)"
                  className="pl-9 h-9"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                />
              </div>
              <div className="flex-1 overflow-auto border border-border rounded-md">
                {filteredAccounts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">Keine Accounts.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredAccounts.map((a) => {
                      const isLinked = linkedIds.has(a.meta_account_id);
                      return (
                        <li
                          key={a.meta_account_id}
                          onClick={() => setSelectedAccount(a.meta_account_id)}
                          className={cn(
                            "px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm",
                            selectedAccount === a.meta_account_id && "bg-primary/10",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {a.name || a.meta_account_id}
                              </div>
                              <div className="text-[11px] font-mono text-muted-foreground truncate">
                                {a.meta_account_id}
                              </div>
                            </div>
                            {isLinked && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                bereits verknüpft
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={!selectedKunde || !selectedAccount || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {selectedAccount && linkedIds.has(selectedAccount)
              ? "Bestehende Verknüpfung ersetzen"
              : "Verknüpfen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
