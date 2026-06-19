import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/Combobox";
import { ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BRANCHEN, normalizeBranche, getBrancheLabel } from "@/lib/branchen";
import { useBranchen } from "@/hooks/useBranchen";
import { pickBrancheLabel, pickClientId, pickClientName } from "@/lib/showcaseFkSelect";
import type { MetaAdRow } from "@/pages/sales/ReferenzWerbeanzeigen";

interface Props {
  open: boolean;
  onClose: () => void;
  rows: MetaAdRow[];
  onSaved: () => void;
}

interface CampaignGroup {
  key: string;
  name: string;
  campaignId: string | null;
  ads: MetaAdRow[];
}
interface AccountGroup {
  key: string;
  name: string;
  campaigns: CampaignGroup[];
  totalAds: number;
  ads: MetaAdRow[];
}

function groupAds(rows: MetaAdRow[]): AccountGroup[] {
  const accMap = new Map<string, Map<string, { campaignId: string | null; name: string; ads: MetaAdRow[] }>>();
  for (const ad of rows) {
    const accKey = ad.meta_account_id || "__unknown__";
    const campId = (ad as any).meta_campaign_id as string | null | undefined;
    const campName = ad.meta_campaign_name?.trim() || "__no_campaign__";
    const campKey = campId || campName;
    if (!accMap.has(accKey)) accMap.set(accKey, new Map());
    const cMap = accMap.get(accKey)!;
    if (!cMap.has(campKey)) cMap.set(campKey, { campaignId: campId ?? null, name: campName, ads: [] });
    cMap.get(campKey)!.ads.push(ad);
  }
  const out: AccountGroup[] = [];
  for (const [accKey, cMap] of accMap) {
    const first = cMap.values().next().value?.ads[0];
    const accName = first?.meta_account_name?.trim() || accKey;
    const campaigns: CampaignGroup[] = [];
    let total = 0;
    const allAds: MetaAdRow[] = [];
    for (const [campKey, c] of cMap) {
      campaigns.push({
        key: `${accKey}::${campKey}`,
        name: c.name === "__no_campaign__" ? "(Ohne Kampagne)" : c.name,
        campaignId: c.campaignId,
        ads: c.ads,
      });
      total += c.ads.length;
      allAds.push(...c.ads);
    }
    campaigns.sort((a, b) => a.name.localeCompare(b.name, "de"));
    out.push({ key: accKey, name: accName, campaigns, totalAds: total, ads: allAds });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function summarizeBranchen(labels: (string | null)[]): { label: string; tone: "ok" | "mixed" | "none" } {
  const norm = labels.map((l) => l?.trim() || null);
  const distinct = new Set(norm.filter(Boolean) as string[]);
  if (distinct.size === 0) return { label: "—", tone: "none" };
  if (norm.some((l) => !l) || distinct.size > 1) return { label: "gemischt", tone: "mixed" };
  return { label: Array.from(distinct)[0]!, tone: "ok" };
}

/** Count of campaigns where at least one ad has no Branche. */
export function countCampaignsWithoutBranche(rows: MetaAdRow[]): number {
  const groups = groupAds(rows);
  let n = 0;
  for (const acc of groups) {
    for (const camp of acc.campaigns) {
      if (camp.ads.some((a) => !pickBrancheLabel(a as any))) n++;
    }
  }
  return n;
}

function resolveBrancheWriteValue(picked: string): string {
  const trimmed = picked.trim();
  if (!trimmed) return trimmed;
  return normalizeBranche(trimmed) ?? trimmed;
}

const MissingPill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
    {children}
  </span>
);

interface ClientRow { id: string; name: string }

export function KampagnenZuordnungModal({ open, onClose, rows, onSaved }: Props) {
  const { data: masterBranchen = [] } = useBranchen();
  const [search, setSearch] = useState("");
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(new Set());
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name")
        .limit(2000);
      if (error) {
        console.error("[KampagnenZuordnung] clients load error:", error);
        return;
      }
      setClients(((data ?? []) as any[]).filter((c) => c.name) as ClientRow[]);
    })();
  }, [open]);

  const accounts = useMemo(() => groupAds(rows), [rows]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts
      .map((a) => ({
        ...a,
        campaigns: a.campaigns.filter(
          (c) => c.name.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
        ),
      }))
      .filter((a) => a.campaigns.length > 0 || a.name.toLowerCase().includes(q));
  }, [accounts, search]);

  const brancheOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; meta?: string }[] = [];
    for (const b of BRANCHEN) {
      opts.push({ value: b.id, label: b.label, meta: b.short });
      seen.add(b.id);
    }
    for (const mb of masterBranchen) {
      const id = normalizeBranche(mb.canonical_name);
      if (id && seen.has(id)) continue;
      const value = id ?? mb.canonical_name.trim();
      if (!value || seen.has(value)) continue;
      opts.push({ value, label: mb.display_name || mb.canonical_name, meta: mb.short_name ?? undefined });
      seen.add(value);
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, "de"));
  }, [masterBranchen]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name })),
    [clients],
  );

  const adBrancheValue = (ad: MetaAdRow): string => {
    const raw = (ad as any).linked_branche_id as string | null | undefined;
    if (!raw) return "";
    return normalizeBranche(raw) ?? raw.trim();
  };

  /** Summarize client status across a set of ads. */
  const summarizeClients = (ads: MetaAdRow[]): { label: string; tone: "ok" | "mixed" | "none"; selected: string } => {
    const ids = new Set<string>();
    let anyMissing = false;
    for (const a of ads) {
      const id = pickClientId(a as any);
      if (id) ids.add(id);
      else anyMissing = true;
    }
    if (ids.size === 0) return { label: "—", tone: "none", selected: "" };
    if (ids.size > 1 || anyMissing) return { label: "gemischt", tone: "mixed", selected: "" };
    const id = Array.from(ids)[0]!;
    const name = clients.find((c) => c.id === id)?.name ?? pickClientName(ads.find((a) => pickClientId(a as any) === id) as any) ?? id;
    return { label: name, tone: "ok", selected: id };
  };

  const accountHasMissingClient = (acc: AccountGroup) => acc.ads.some((a) => !pickClientId(a as any));
  const campaignHasMissingBranche = (camp: CampaignGroup) => camp.ads.some((a) => !pickBrancheLabel(a as any));

  const toggleAccount = (k: string) =>
    setOpenAccounts((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const toggleCampaign = (k: string) =>
    setOpenCampaigns((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const updateCampaignBranche = async (camp: CampaignGroup, picked: string) => {
    const writeValue = resolveBrancheWriteValue(picked);
    if (!writeValue) return;
    setSavingKey(camp.key);
    try {
      const ids = camp.ads.map((a) => a.id);
      console.log("[KampagnenZuordnung] updating ads:", ids, "to branche:", writeValue);
      const { data, error } = await supabase
        .from("referenz_meta_ads" as any)
        .update({ linked_branche_id: writeValue })
        .in("id", ids)
        .select("id");
      if (error) {
        toast.error(`Speichern fehlgeschlagen: ${error.message}`);
        return;
      }
      const updated = (data ?? []) as unknown as { id: string }[];
      if (updated.length === 0) { toast.error("Keine Zeilen aktualisiert"); return; }
      if (updated.length !== ids.length) toast.warning(`Nur ${updated.length}/${ids.length} Ads aktualisiert`);
      else toast.success(`${getBrancheLabel(writeValue)} auf ${updated.length} Ads gesetzt`);
      onSaved();
    } catch (e: any) {
      toast.error(`Speichern fehlgeschlagen: ${e?.message ?? "unbekannt"}`);
    } finally {
      setSavingKey(null);
    }
  };

  const updateAdBranche = async (ad: MetaAdRow, picked: string) => {
    const writeValue = resolveBrancheWriteValue(picked);
    if (!writeValue) return;
    setSavingKey(`ad:${ad.id}`);
    try {
      const { data, error } = await supabase
        .from("referenz_meta_ads" as any)
        .update({ linked_branche_id: writeValue })
        .eq("id", ad.id)
        .select("id");
      if (error) { toast.error(`Speichern fehlgeschlagen: ${error.message}`); return; }
      if (!data || data.length === 0) { toast.error("Keine Zeilen aktualisiert"); return; }
      toast.success(`${getBrancheLabel(writeValue)} gesetzt`);
      onSaved();
    } catch (e: any) {
      toast.error(`Speichern fehlgeschlagen: ${e?.message ?? "unbekannt"}`);
    } finally {
      setSavingKey(null);
    }
  };

  const updateAccountClient = async (acc: AccountGroup, clientId: string) => {
    if (!clientId) return;
    setSavingKey(`client:${acc.key}`);
    try {
      const ids = acc.ads.map((a) => a.id);
      console.log("[KampagnenZuordnung] updating ads:", ids, "to client:", clientId);
      const { data, error } = await supabase
        .from("referenz_meta_ads" as any)
        .update({ linked_client_id: clientId })
        .in("id", ids)
        .select("id");
      if (error) {
        toast.error(`Speichern fehlgeschlagen: ${error.message}`);
        return;
      }
      const updated = (data ?? []) as unknown as { id: string }[];
      if (updated.length === 0) { toast.error("Keine Zeilen aktualisiert"); return; }
      const clientName = clients.find((c) => c.id === clientId)?.name ?? "Kunde";
      if (updated.length !== ids.length) toast.warning(`Nur ${updated.length}/${ids.length} Ads aktualisiert`);
      else toast.success(`${clientName} auf ${updated.length} Ads gesetzt`);
      onSaved();
    } catch (e: any) {
      toast.error(`Speichern fehlgeschlagen: ${e?.message ?? "unbekannt"}`);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Kampagnen-Zuordnung</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Kunde pro Werbeaccount, Branche pro Kampagne oder Anzeige. Werbeaccount/Kampagnen-Auswahl überschreibt alle zugehörigen Ads.
          </p>
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Account oder Kampagne suchen..."
              className="pl-9 h-9"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {visible.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">Keine Werbeaccounts gefunden.</div>
          ) : (
            visible.map((acc) => {
              const expanded = openAccounts.has(acc.key);
              const clientStatus = summarizeClients(acc.ads);
              const missingClient = accountHasMissingClient(acc);
              const brancheStatus = summarizeBranchen(acc.ads.map((a) => pickBrancheLabel(a as any)));
              const missingBranche = acc.ads.some((a) => !pickBrancheLabel(a as any));
              const accSaving = savingKey === `client:${acc.key}`;
              return (
                <div
                  key={acc.key}
                  className={`rounded-lg border bg-card ${missingClient || missingBranche ? "border-l-2 border-l-amber-500 border-border" : "border-border"}`}
                >
                  <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleAccount(acc.key)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          {acc.name}
                          {missingClient && <MissingPill>Kunde fehlt</MissingPill>}
                          {missingBranche && <MissingPill>Branche fehlt</MissingPill>}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {acc.campaigns.length} Kampagnen · {acc.totalAds} Ads ·{" "}
                          <span
                            className={
                              clientStatus.tone === "ok"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : clientStatus.tone === "mixed"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                            }
                          >
                            Kunde: {clientStatus.label}
                          </span>
                          {" · "}
                          <span
                            className={
                              brancheStatus.tone === "ok"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : brancheStatus.tone === "mixed"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                            }
                          >
                            Branche: {brancheStatus.label}
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="w-64 shrink-0 flex items-center gap-2">
                      <Combobox
                        value={clientStatus.selected}
                        onChange={(v) => v && updateAccountClient(acc, v)}
                        options={clientOptions}
                        placeholder="Kunde für Account"
                        allowCreate={false}
                        compact
                        disabled={accSaving}
                        selectedLabel={clients.find((c) => c.id === clientStatus.selected)?.name}
                      />
                      {accSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {acc.campaigns.map((camp) => {
                        const cExpanded = openCampaigns.has(camp.key);
                        const status = summarizeBranchen(camp.ads.map((a) => pickBrancheLabel(a as any)));
                        const campValues = new Set(camp.ads.map((a) => adBrancheValue(a)).filter(Boolean));
                        const campSelected = campValues.size === 1 ? Array.from(campValues)[0]! : "";
                        const missingBranche = campaignHasMissingBranche(camp);
                        return (
                          <div
                            key={camp.key}
                            className={`bg-background/40 ${missingBranche ? "border-l-2 border-l-amber-500" : ""}`}
                          >
                            <div className="flex items-center gap-3 px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleCampaign(camp.key)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${cExpanded ? "rotate-90" : ""}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm truncate flex items-center gap-2">
                                    {camp.name}
                                    {missingBranche && <MissingPill>Branche fehlt</MissingPill>}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground tabular-nums">
                                    {camp.ads.length} Ads ·{" "}
                                    <span
                                      className={
                                        status.tone === "ok"
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : status.tone === "mixed"
                                            ? "text-amber-600 dark:text-amber-400"
                                            : "text-muted-foreground"
                                      }
                                    >
                                      {status.label}
                                    </span>
                                  </div>
                                </div>
                              </button>
                              <div className="w-64 shrink-0 flex items-center gap-2">
                                <Combobox
                                  value={campSelected}
                                  onChange={(v) => v && updateCampaignBranche(camp, v)}
                                  options={brancheOptions}
                                  placeholder="Branche für Kampagne"
                                  allowCreate={false}
                                  compact
                                  disabled={savingKey === camp.key}
                                />
                                {savingKey === camp.key && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                              </div>
                            </div>

                            {cExpanded && (
                              <div className="px-4 pb-3 space-y-1.5">
                                {camp.ads.map((ad) => {
                                  const thumb = ad.thumbnail_url_persisted ?? ad.thumbnail_url ?? ad.thumbnail_url_meta;
                                  const title = ad.custom_title ?? ad.meta_ad_name ?? "(ohne Titel)";
                                  const current = adBrancheValue(ad);
                                  const saving = savingKey === `ad:${ad.id}`;
                                  const adMissing = !pickBrancheLabel(ad as any);
                                  return (
                                    <div
                                      key={ad.id}
                                      className={`flex items-center gap-3 pl-6 pr-1 py-1.5 rounded-md hover:bg-muted/30 ${adMissing ? "border-l-2 border-l-amber-500" : ""}`}
                                    >
                                      <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : null}
                                      </div>
                                      <div className="flex-1 min-w-0 text-xs truncate flex items-center gap-2">
                                        <span className="truncate">{title}</span>
                                        {adMissing && <MissingPill>Branche fehlt</MissingPill>}
                                      </div>
                                      <div className="w-56 shrink-0 flex items-center gap-2">
                                        <Combobox
                                          value={current}
                                          onChange={(v) => v && updateAdBranche(ad, v)}
                                          options={brancheOptions}
                                          placeholder="Branche"
                                          allowCreate={false}
                                          compact
                                          disabled={saving}
                                        />
                                        {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
