import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMetaAds } from "@/contexts/MetaAdsContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Check } from "lucide-react";

interface ImportableAd {
  meta_ad_id: string;
  meta_ad_name: string;
  meta_account_id: string;
  meta_account_name?: string;
  meta_campaign_name?: string;
  status?: string;
  ad_format?: string;
  thumbnail_url?: string | null;
  metrics?: { leads?: number; cpl?: number | null; spend?: number; roas?: number | null } | null;
  already_imported?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function MetaAdImportModal({ open, onClose, onImported }: Props) {
  const { accounts, loadingAccounts } = useMetaAds();
  const { toast } = useToast();
  const [accountId, setAccountId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");
  const [ads, setAds] = useState<ImportableAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paging, setPaging] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);

  useEffect(() => {
    if (open && !accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [open, accounts]);

  const loadAds = async (after?: string) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-list-importable", {
        body: { accountId, status, limit: 25, after },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const newAds = (data as any).ads as ImportableAd[];
      setAds(after ? [...ads, ...newAds] : newAds);
      setPaging((data as any).paging ?? null);
    } catch (e) {
      toast({ title: "Fehler beim Laden", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && accountId) loadAds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, status, open]);

  const filtered = useMemo(() => {
    if (!search) return ads;
    const q = search.toLowerCase();
    return ads.filter(a =>
      (a.meta_ad_name ?? "").toLowerCase().includes(q) ||
      (a.meta_campaign_name ?? "").toLowerCase().includes(q)
    );
  }, [ads, search]);

  const toggle = (id: string, imported?: boolean) => {
    if (imported) return;
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  const doImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setImportLog([`Importiere ${selected.size} Anzeigen...`]);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-import-to-showcase", {
        body: { adIds: Array.from(selected) },
      });
      if (error) throw error;
      const res = data as any;
      const log = [`✅ ${res.imported?.length ?? 0} importiert`];
      if (res.errors?.length) {
        res.errors.forEach((e: any) => log.push(`❌ ${e.id}: ${e.error}`));
      }
      setImportLog(log);
      onImported();
      setTimeout(() => {
        setSelected(new Set());
        setImporting(false);
        setImportLog([]);
        onClose();
      }, 1200);
    } catch (e) {
      setImportLog([...importLog, `❌ ${(e as Error).message}`]);
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !importing && onClose()}>
      <DialogContent persistent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Aus Meta Ads importieren</DialogTitle>
        </DialogHeader>

        {importing ? (
          <div className="py-10 text-sm space-y-2">
            {importLog.map((l, i) => <div key={i} className="font-mono">{l}</div>)}
            {importing && importLog.length < 2 && <Loader2 className="w-5 h-5 animate-spin" />}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="text-sm bg-background border border-border rounded-md px-3 h-9 min-w-48"
                disabled={loadingAccounts}
              >
                <option value="">— Account wählen —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Anzeigen-Name..." className="pl-8 h-9 w-56" />
              </div>

              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="text-sm bg-background border border-border rounded-md px-3 h-9">
                <option value="ALL">Alle Status</option>
                <option value="ACTIVE">Aktiv</option>
                <option value="PAUSED">Pausiert</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5 mt-3">
              {loading && ads.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Keine Anzeigen gefunden.</div>
              ) : (
                filtered.map(ad => {
                  const isSel = selected.has(ad.meta_ad_id);
                  const m = ad.metrics ?? {};
                  return (
                    <button
                      key={ad.meta_ad_id}
                      onClick={() => toggle(ad.meta_ad_id, ad.already_imported)}
                      disabled={ad.already_imported}
                      className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                        ad.already_imported ? "opacity-40 cursor-not-allowed bg-muted/30 border-border" :
                        isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSel ? "bg-primary border-primary" : "border-border"
                      }`}>
                        {isSel && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                      </div>
                      <div className="w-14 h-14 bg-muted rounded overflow-hidden flex-shrink-0">
                        {ad.thumbnail_url ? <img src={ad.thumbnail_url} alt="" className="w-full h-full object-cover" /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ad.meta_ad_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {ad.meta_campaign_name ?? "—"}
                          {ad.already_imported && <span className="ml-2 text-amber-600">· Bereits importiert</span>}
                        </p>
                        {ad.metrics && (
                          <div className="flex gap-3 mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {m.cpl != null && <span>€{m.cpl} CPL</span>}
                            {m.leads != null && <span>{m.leads} Leads</span>}
                            {m.roas != null && <span>{m.roas}x ROAS</span>}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}

              {paging?.cursors?.after && !loading && (
                <div className="text-center pt-2">
                  <Button size="sm" variant="ghost" onClick={() => loadAds(paging.cursors.after)}>Mehr laden</Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button disabled={selected.size === 0} onClick={doImport}>
                {selected.size} Anzeige{selected.size === 1 ? "" : "n"} importieren →
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
