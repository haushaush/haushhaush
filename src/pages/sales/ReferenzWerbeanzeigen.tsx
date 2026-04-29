import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Star, Settings2, Video } from "lucide-react";
import { MetaAdImportModal } from "@/components/sales/MetaAdImportModal";
import { ShowcaseFilterManagementModal, type FilterCategory, type FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";

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

  const [rows, setRows] = useState<MetaAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});
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
        .in("applies_to", ["werbeanzeige", "both"]).eq("is_active", true).order("display_order"),
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
    Object.entries(activeFilters).forEach(([catKey, vals]) => {
      if (vals.size === 0) return;
      r = r.filter(x => {
        const v = (x.filter_values ?? {})[catKey];
        return v && vals.has(v);
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

  const toggleFilter = (catKey: string, value: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      const set = new Set(next[catKey] ?? []);
      if (set.has(value)) set.delete(value); else set.add(value);
      next[catKey] = set;
      return next;
    });
  };
  const clearCategory = (catKey: string) => setActiveFilters(prev => ({ ...prev, [catKey]: new Set() }));
  const toggleTag = (t: string) => setActiveTags(prev => {
    const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n;
  });

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Werbeanzeigen</h1>
          <p className="text-sm text-muted-foreground mt-1">Aus Meta importierte Top-Performer für Sales-Pitches</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
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

        {categories.map(cat => {
          const catOpts = options.filter(o => o.category_id === cat.id);
          if (catOpts.length === 0) return null;
          const active = activeFilters[cat.key] ?? new Set();
          return (
            <div key={cat.id} className="flex items-start gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground pt-1.5 min-w-20">{cat.label}:</span>
              <button
                onClick={() => clearCategory(cat.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${active.size === 0 ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:border-foreground/50"}`}
              >
                Alle
              </button>
              {catOpts.map(o => {
                const isOn = active.has(o.key);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggleFilter(cat.key, o.key)}
                    style={isOn ? { backgroundColor: o.color_hex, borderColor: o.color_hex, color: "#fff" } : { borderColor: `${o.color_hex}55` }}
                    className="text-xs px-2.5 py-1 rounded-full border transition hover:opacity-80"
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          );
        })}

        {topTags.length > 0 && (
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground pt-1.5 min-w-20">Tags:</span>
            {topTags.map(t => {
              const on = activeTags.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/50"}`}
                >
                  #{t}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-medium text-muted-foreground">Sortieren:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="text-xs bg-background border border-border rounded-md px-2 h-8">
            <option value="performance">Performance</option>
            <option value="leads">Leads</option>
            <option value="cpl">CPL (niedrig)</option>
            <option value="roas">ROAS (hoch)</option>
            <option value="created">Importdatum</option>
          </select>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">{filtered.length} Anzeigen</span>
        </div>
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
