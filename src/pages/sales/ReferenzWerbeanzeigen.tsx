import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Star, Settings2, Video, Sparkles, Loader2, ChevronDown } from "lucide-react";
import { MetaAdImportModal } from "@/components/sales/MetaAdImportModal";
import { ShowcaseFilterManagementModal, type FilterCategory, type FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";
import { useToast } from "@/hooks/use-toast";

export interface MetaAdRow {
  id: string;
  meta_ad_id: string;
  meta_ad_name: string | null;
  meta_account_id: string;
  meta_account_name: string | null;
  meta_campaign_name: string | null;
  meta_adset_name: string | null;
  ad_format: string | null;
  thumbnail_url: string | null;
  thumbnail_url_meta: string | null;
  thumbnail_url_persisted: string | null;
  video_url: string | null;
  meta_metrics: Record<string, any> | null;
  custom_title: string | null;
  custom_description: string | null;
  custom_tags: string[] | null;
  filter_values: Record<string, string> | null;
  linked_kunde_id: string | null;
  is_featured: boolean;
  campaign_period_start: string | null;
  campaign_period_end: string | null;
}

type SortKey = "performance" | "created" | "cpl" | "roas" | "leads";

export default function ReferenzWerbeanzeigenPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { toast } = useToast();
  const [reenriching, setReenriching] = useState(false);

  const [rows, setRows] = useState<MetaAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("performance");

  const [importOpen, setImportOpen] = useState(false);
  const [filterMgmtOpen, setFilterMgmtOpen] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: ads }, { data: cats }, { data: opts }] = await Promise.all([
      supabase.from("referenz_meta_ads" as any).select("*").eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("imported_at", { ascending: false }),
      supabase.from("showcase_filter_categories" as any).select("*")
        .in("applies_to", ["werbeanzeige", "both", "all"]).eq("is_active", true).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").eq("is_active", true).order("display_order"),
    ]);
    setRows(((ads ?? []) as any[]) as MetaAdRow[]);
    setCategories((cats ?? []) as any);
    setOptions((opts ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Top tags by frequency
  const topTags = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => (r.custom_tags ?? []).forEach(t => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        (x.custom_title ?? x.meta_ad_name ?? "").toLowerCase().includes(q) ||
        (x.meta_account_name ?? "").toLowerCase().includes(q) ||
        (x.custom_tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    Object.entries(activeFilters).forEach(([catKey, val]) => {
      if (!val) return;
      r = r.filter(x => {
        const v = (x.filter_values ?? {})[catKey];
        return v === val;
      });
    });
    if (activeTags.size > 0) {
      r = r.filter(x => (x.custom_tags ?? []).some(t => activeTags.has(t)));
    }

    const sorted = [...r];
    sorted.sort((a, b) => {
      // featured always first
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      const am = a.meta_metrics ?? {}; const bm = b.meta_metrics ?? {};
      switch (sortBy) {
        case "performance": {
          const sa = (am.roas ?? 0) * 10 + (am.leads ?? 0) / 100;
          const sb = (bm.roas ?? 0) * 10 + (bm.leads ?? 0) / 100;
          return sb - sa;
        }
        case "cpl": return (am.cpl ?? Infinity) - (bm.cpl ?? Infinity);
        case "roas": return (bm.roas ?? 0) - (am.roas ?? 0);
        case "leads": return (bm.leads ?? 0) - (am.leads ?? 0);
        case "created":
        default: return 0;
      }
    });
    return sorted;
  }, [rows, search, activeFilters, activeTags, sortBy]);

  const setFilter = (catKey: string, value: string) => {
    setActiveFilters(prev => ({ ...prev, [catKey]: value }));
  };
  const clearFilter = (catKey: string) => setActiveFilters(prev => {
    const next = { ...prev }; delete next[catKey]; return next;
  });
  const clearAllFilters = () => setActiveFilters({});
  const toggleTag = (t: string) => setActiveTags(prev => {
    const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n;
  });

  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ad Creatives</h1>
          <p className="text-sm text-muted-foreground mt-1">Aus Meta importierte Top-Performer für Sales-Pitches</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={reenriching}
              onClick={async () => {
                setReenriching(true);
                const { data, error } = await supabase.functions.invoke("meta-ads-bulk-reenrich");
                setReenriching(false);
                if (error) {
                  toast({ title: "Fehler", description: error.message, variant: "destructive" });
                } else {
                  const d = data as any;
                  toast({
                    title: "Enrichment fertig",
                    description: `${d.enriched ?? 0} Anzeigen aktualisiert · ${d.linked ?? 0} mit Kunde verknüpft`,
                  });
                  load();
                }
              }}
            >
              {reenriching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Auto-Enrich
            </Button>
            <Button variant="outline" onClick={() => setFilterMgmtOpen(true)}>
              <Settings2 className="w-4 h-4 mr-2" /> Filter verwalten
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Aus Meta importieren
            </Button>
          </div>
        )}
      </header>

      <div className="space-y-3 mb-5">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suche nach Titel, Tag, Kunde..." className="pl-8" />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {categories.map(cat => {
            const catOpts = options
              .filter(o => o.category_id === cat.id && o.is_active)
              .slice()
              .sort((a, b) => a.label.localeCompare(b.label));
            if (catOpts.length === 0) return null;
            const currentValue = activeFilters[cat.key] ?? "";
            const hasValue = !!currentValue;
            return (
              <div key={cat.id} className="relative">
                <select
                  value={currentValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setFilter(cat.key, v); else clearFilter(cat.key);
                  }}
                  className={`appearance-none pl-3 pr-9 h-9 text-xs rounded-md border cursor-pointer transition-colors ${
                    hasValue
                      ? "bg-primary/10 border-primary text-foreground font-medium"
                      : "bg-background border-border text-foreground hover:border-foreground/40"
                  }`}
                >
                  <option value="">{cat.label}: Alle</option>
                  {catOpts.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-muted-foreground" />
                {hasValue && (
                  <button
                    onClick={() => clearFilter(cat.key)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-foreground text-background rounded-full flex items-center justify-center text-[10px] leading-none hover:opacity-80"
                    title="Filter entfernen"
                    aria-label="Filter entfernen"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <div className="relative ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="appearance-none pl-3 pr-9 h-9 text-xs bg-background border border-border rounded-md cursor-pointer hover:border-foreground/40"
            >
              <option value="performance">Sortieren: Performance</option>
              <option value="leads">Meiste Leads</option>
              <option value="cpl">CPL (niedrig)</option>
              <option value="roas">ROAS (hoch)</option>
              <option value="created">Importdatum</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-muted-foreground" />
          </div>
        </div>

        {(activeFilterCount > 0 || activeTags.size > 0) && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {activeFilterCount + activeTags.size} Filter aktiv
            </span>
            <button
              onClick={() => { clearAllFilters(); setActiveTags(new Set()); }}
              className="text-primary hover:underline"
            >
              Alle zurücksetzen
            </button>
            <span className="text-muted-foreground ml-auto tabular-nums">{filtered.length} Anzeigen</span>
          </div>
        )}

        {topTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs text-muted-foreground">Tags:</span>
            {topTags.slice(0, 8).map(t => {
              const on = activeTags.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
                  }`}
                >
                  #{t}
                </button>
              );
            })}
          </div>
        )}

        {activeFilterCount === 0 && activeTags.size === 0 && (
          <div className="flex items-center pt-1">
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">{filtered.length} Anzeigen</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">{rows.length === 0 ? "Noch keine Anzeigen importiert." : "Keine Treffer für die aktuellen Filter."}</p>
          {isAdmin && rows.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Erste Anzeigen importieren
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {filtered.map(ad => <MetaAdCard key={ad.id} ad={ad} options={options} />)}
        </div>
      )}

      <MetaAdImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <ShowcaseFilterManagementModal open={filterMgmtOpen} onClose={() => setFilterMgmtOpen(false)} onChanged={load} appliesTo="werbeanzeige" />
    </div>
  );
}

function MetaAdCard({ ad, options }: { ad: MetaAdRow; options: FilterOption[] }) {
  const m = ad.meta_metrics ?? {};
  const isVideo = ad.ad_format === "video" || ad.ad_format === "reel";
  const isReel = ad.ad_format === "reel";
  const displayUrl = ad.thumbnail_url_persisted || ad.thumbnail_url || ad.thumbnail_url_meta;
  const optionByKey = (catKey: string, optKey: string) =>
    options.find(o => o.key === optKey); // categories enforce uniqueness in seed; lookup ok

  return (
    <Link
      to={`/sales/referenz-showcase/werbeanzeigen/${ad.id}`}
      className="group bg-card rounded-lg border border-border hover:border-primary/60 hover:shadow-md transition-all overflow-hidden flex flex-col"
    >
      <div
        className="bg-muted relative overflow-hidden"
        style={{ aspectRatio: isReel ? "9 / 16" : "1 / 1" }}
      >
        {displayUrl ? (
          <img src={displayUrl} alt={ad.meta_ad_name ?? ""} loading="lazy" className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        {isVideo && (
          <div className="absolute top-2 right-2 bg-background/90 backdrop-blur text-[10px] uppercase font-medium rounded px-2 py-0.5">
            ▶ {ad.ad_format}
          </div>
        )}
        {ad.is_featured && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1">
            <Star className="w-3 h-3" fill="currentColor" />
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5 truncate">
          {ad.meta_account_name ?? ad.meta_account_id}
        </div>
        <h3 className="text-sm font-medium truncate">{ad.custom_title || ad.meta_ad_name}</h3>

        {ad.filter_values && Object.keys(ad.filter_values).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(ad.filter_values).slice(0, 3).map(([catKey, val]) => {
              const opt = optionByKey(catKey, val);
              return (
                <span
                  key={catKey}
                  className="text-[10px] px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: opt?.color_hex ?? "#6B7280" }}
                >
                  {opt?.label ?? val}
                </span>
              );
            })}
          </div>
        )}

        {(m.cpl != null || m.roas != null || m.leads != null) && (
          <div className="grid grid-cols-2 gap-1 mt-2 text-[11px] tabular-nums">
            {m.cpl != null && (
              <div className="bg-muted/60 px-2 py-1 rounded"><span className="text-muted-foreground">CPL</span> <strong>€{m.cpl}</strong></div>
            )}
            {m.roas != null && (
              <div className="bg-muted/60 px-2 py-1 rounded"><span className="text-muted-foreground">ROAS</span> <strong>{m.roas}x</strong></div>
            )}
            {m.leads != null && (
              <div className="bg-muted/60 px-2 py-1 rounded col-span-2"><span className="text-muted-foreground">Leads</span> <strong>{m.leads}</strong></div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
