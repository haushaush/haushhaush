import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/Combobox";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BRANCHE_ALIASES, getCanonicalBranche, getBrancheShortName } from "@/lib/branche-aliases";
import { useBranchen } from "@/hooks/useBranchen";
import { pickBrancheLabel } from "@/lib/showcaseFkSelect";
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
  ads: MetaAdRow[];
}
interface AccountGroup {
  key: string;
  name: string;
  campaigns: CampaignGroup[];
  totalAds: number;
}

function groupAds(rows: MetaAdRow[]): AccountGroup[] {
  const accMap = new Map<string, Map<string, MetaAdRow[]>>();
  for (const ad of rows) {
    const accKey = ad.meta_account_id || "__unknown__";
    const campKey = ad.meta_campaign_name?.trim() || "__no_campaign__";
    if (!accMap.has(accKey)) accMap.set(accKey, new Map());
    const cMap = accMap.get(accKey)!;
    if (!cMap.has(campKey)) cMap.set(campKey, []);
    cMap.get(campKey)!.push(ad);
  }
  const out: AccountGroup[] = [];
  for (const [accKey, cMap] of accMap) {
    const first = cMap.values().next().value?.[0];
    const accName = first?.meta_account_name?.trim() || accKey;
    const campaigns: CampaignGroup[] = [];
    let total = 0;
    for (const [campKey, ads] of cMap) {
      campaigns.push({ key: `${accKey}::${campKey}`, name: campKey === "__no_campaign__" ? "(Ohne Kampagne)" : campKey, ads });
      total += ads.length;
    }
    campaigns.sort((a, b) => a.name.localeCompare(b.name, "de"));
    out.push({ key: accKey, name: accName, campaigns, totalAds: total });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function campaignBrancheStatus(ads: MetaAdRow[]): { label: string; tone: "ok" | "mixed" | "none" } {
  const labels = ads.map((a) => pickBrancheLabel(a as any)).map((l) => l?.trim() || null);
  const distinct = new Set(labels.filter(Boolean));
  if (distinct.size === 0) return { label: "—", tone: "none" };
  if (labels.some((l) => !l)) return { label: "gemischt", tone: "mixed" };
  if (distinct.size > 1) return { label: "gemischt", tone: "mixed" };
  return { label: Array.from(distinct)[0] as string, tone: "ok" };
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

export function KampagnenZuordnungModal({ open, onClose, rows, onSaved }: Props) {
  const { data: masterBranchen = [] } = useBranchen();
  const [search, setSearch] = useState("");
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(new Set());
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // local overrides so UI reflects updates without parent reload
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const dirty = Object.keys(overrides).length > 0;

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
    const canonicals = new Set<string>();
    const shortFromMaster = new Map<string, string>();
    for (const g of BRANCHE_ALIASES) canonicals.add(g.canonical);
    for (const m of masterBranchen) {
      const canonical = getCanonicalBranche(m.canonical_name);
      canonicals.add(canonical);
      if (m.short_name) shortFromMaster.set(canonical.toLowerCase(), m.short_name);
    }
    return Array.from(canonicals)
      .sort((a, b) => a.localeCompare(b, "de"))
      .map((canonical) => ({
        value: canonical,
        label: canonical,
        meta: shortFromMaster.get(canonical.toLowerCase()) ?? getBrancheShortName(canonical),
      }));
  }, [masterBranchen]);

  const effectiveBrancheFor = (ad: MetaAdRow): string | null => {
    const o = overrides[ad.id];
    if (o !== undefined) return o;
    return pickBrancheLabel(ad as any);
  };

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

  const handleClose = () => {
    if (dirty) onSaved();
    setOverrides({});
    onClose();
  };

  const updateCampaign = async (camp: CampaignGroup, branche: string) => {
    const canonical = getCanonicalBranche(branche);
    setSavingKey(camp.key);
    try {
      const ids = camp.ads.map((a) => a.id);
      const { error } = await supabase
        .from("referenz_meta_ads" as any)
        .update({ linked_branche_id: canonical })
        .in("id", ids);
      if (error) throw error;
      setOverrides((o) => {
        const n = { ...o };
        for (const id of ids) n[id] = canonical;
        return n;
      });
      toast.success(`${canonical} auf ${ids.length} Ads gesetzt`);
    } catch (e: any) {
      toast.error(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSavingKey(null);
    }
  };

  const updateAd = async (ad: MetaAdRow, branche: string) => {
    const canonical = getCanonicalBranche(branche);
    setSavingKey(`ad:${ad.id}`);
    try {
      const { error } = await supabase
        .from("referenz_meta_ads" as any)
        .update({ linked_branche_id: canonical })
        .eq("id", ad.id);
      if (error) throw error;
      setOverrides((o) => ({ ...o, [ad.id]: canonical }));
      toast.success(`${canonical} gesetzt`);
    } catch (e: any) {
      toast.error(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Kampagnen-Zuordnung</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Branche pro Werbeaccount → Kampagne → Anzeige. Kampagnen-Auswahl überschreibt alle Ads der Kampagne.
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
              return (
                <div key={acc.key} className="rounded-lg border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => toggleAccount(acc.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{acc.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {acc.campaigns.length} Kampagnen · {acc.totalAds} Ads
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {acc.campaigns.map((camp) => {
                        const cExpanded = openCampaigns.has(camp.key);
                        const status = campaignBrancheStatus(
                          camp.ads.map((a) => ({ ...a, linked_branche_id: effectiveBrancheFor(a) ?? (a as any).linked_branche_id })) as any,
                        );
                        return (
                          <div key={camp.key} className="bg-background/40">
                            <div className="flex items-center gap-3 px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleCampaign(camp.key)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              >
                                <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${cExpanded ? "rotate-90" : ""}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm truncate">{camp.name}</div>
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
                                  value={status.tone === "ok" ? status.label : ""}
                                  onChange={(v) => v && updateCampaign(camp, v)}
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
                                  const current = effectiveBrancheFor(ad);
                                  const saving = savingKey === `ad:${ad.id}`;
                                  return (
                                    <div key={ad.id} className="flex items-center gap-3 pl-6 pr-1 py-1.5 rounded-md hover:bg-muted/30">
                                      <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : null}
                                      </div>
                                      <div className="flex-1 min-w-0 text-xs truncate">{title}</div>
                                      <div className="w-56 shrink-0 flex items-center gap-2">
                                        <Combobox
                                          value={current ?? ""}
                                          onChange={(v) => v && updateAd(ad, v)}
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
