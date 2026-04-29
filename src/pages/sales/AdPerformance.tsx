import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Star, Settings2, BarChart3, ChevronDown } from "lucide-react";
import { MetaCampaignImportModal } from "@/components/sales/MetaCampaignImportModal";
import { ShowcaseFilterManagementModal, type FilterCategory, type FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";

export interface CampaignRow {
  id: string;
  meta_campaign_id: string;
  meta_campaign_name: string | null;
  meta_account_id: string;
  meta_account_name: string | null;
  meta_objective: string | null;
  meta_status: string | null;
  metrics: Record<string, any> | null;
  campaign_period_start: string | null;
  campaign_period_end: string | null;
  metrics_last_refreshed_at: string | null;
  total_ads_count: number | null;
  total_adsets_count: number | null;
  custom_title: string | null;
  custom_description: string | null;
  custom_setup_notes: string | null;
  custom_results_summary: string | null;
  custom_tags: string[] | null;
  filter_values: Record<string, string> | null;
  linked_kunde_id: string | null;
  is_featured: boolean;
}

type SortKey = "best_roas" | "lowest_cpl" | "most_leads" | "highest_spend" | "newest";

function fmtPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  const f = (s: string | null) => s ? new Date(s).toLocaleDateString("de-DE", { month: "short", year: "numeric" }) : "—";
  return `${f(start)} – ${f(end)}`;
}

export default function AdPerformancePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<SortKey>("best_roas");

  const [importOpen, setImportOpen] = useState(false);
  const [filterMgmtOpen, setFilterMgmtOpen] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: camps }, { data: cats }, { data: opts }] = await Promise.all([
      supabase.from("referenz_meta_campaigns" as any).select("*").eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("imported_at", { ascending: false }),
      supabase.from("showcase_filter_categories" as any).select("*")
        .in("applies_to", ["kampagne", "all", "both"]).eq("is_active", true).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").eq("is_active", true).order("display_order"),
    ]);
    setRows(((camps ?? []) as any[]) as CampaignRow[]);
    setCategories((cats ?? []) as any);
    setOptions((opts ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        (x.custom_title ?? x.meta_campaign_name ?? "").toLowerCase().includes(q) ||
        (x.meta_account_name ?? "").toLowerCase().includes(q) ||
        (x.custom_description ?? "").toLowerCase().includes(q) ||
        (x.custom_tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    Object.entries(activeFilters).forEach(([catKey, val]) => {
      if (!val) return;
      r = r.filter(x => (x.filter_values ?? {})[catKey] === val);
    });

    const sorted = [...r];
    sorted.sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      const am = a.metrics ?? {}; const bm = b.metrics ?? {};
      switch (sortBy) {
        case "best_roas": return (bm.roas ?? 0) - (am.roas ?? 0);
        case "lowest_cpl": return (am.cpl ?? Infinity) - (bm.cpl ?? Infinity);
        case "most_leads": return (bm.leads ?? 0) - (am.leads ?? 0);
        case "highest_spend": return (bm.spend ?? 0) - (am.spend ?? 0);
        case "newest":
        default:
          return (b.campaign_period_end ?? "").localeCompare(a.campaign_period_end ?? "");
      }
    });
    return sorted;
  }, [rows, search, activeFilters, sortBy]);

  const setFilter = (k: string, v: string) => setActiveFilters(p => ({ ...p, [k]: v }));
  const clearFilter = (k: string) => setActiveFilters(p => { const n = { ...p }; delete n[k]; return n; });
  const clearAllFilters = () => setActiveFilters({});
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ad Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">Top-Kampagnen mit echten Performance-Zahlen für Sales-Pitches</p>
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suche nach Kampagne, Kunde, Beschreibung…" className="pl-8" />
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
              <option value="best_roas">Bester ROAS</option>
              <option value="lowest_cpl">Niedrigster CPL</option>
              <option value="most_leads">Meiste Leads</option>
              <option value="highest_spend">Höchster Spend</option>
              <option value="newest">Neueste</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-muted-foreground" />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">{activeFilterCount} Filter aktiv</span>
            <button onClick={clearAllFilters} className="text-primary hover:underline">Alle zurücksetzen</button>
            <span className="text-muted-foreground ml-auto tabular-nums">{filtered.length} Kampagnen</span>
          </div>
        )}
        {activeFilterCount === 0 && (
          <div className="flex items-center pt-1">
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">{filtered.length} Kampagnen</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-56 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{rows.length === 0 ? "Noch keine Kampagnen importiert." : "Keine Treffer für die aktuellen Filter."}</p>
          {isAdmin && rows.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Erste Kampagne aus Meta importieren
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => <CampaignCard key={c.id} campaign={c} options={options} />)}
        </div>
      )}

      <MetaCampaignImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <ShowcaseFilterManagementModal open={filterMgmtOpen} onClose={() => setFilterMgmtOpen(false)} onChanged={load} appliesTo="kampagne" />
    </div>
  );
}

function CampaignCard({ campaign, options }: { campaign: CampaignRow; options: FilterOption[] }) {
  const m = campaign.metrics ?? {};
  const roas = Number(m.roas ?? 0);
  const tier = roas >= 3 ? "excellent" : roas >= 2 ? "good" : "standard";

  const tierClasses: Record<string, string> = {
    excellent: "border-emerald-500/60 bg-gradient-to-br from-emerald-500/10 to-card",
    good: "border-primary/60 bg-gradient-to-br from-primary/10 to-card",
    standard: "border-border bg-card",
  };

  const branche = campaign.filter_values?.branche;
  const brancheLabel = branche ? options.find(o => o.key === branche)?.label : null;

  return (
    <Link
      to={`/sales/referenz-showcase/ad-performance/${campaign.id}`}
      className={`block border-2 rounded-lg p-5 hover:shadow-md transition-all ${tierClasses[tier]}`}
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{campaign.custom_title || campaign.meta_campaign_name}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {campaign.meta_account_name ?? campaign.meta_account_id}
            {brancheLabel && (
              <span className="ml-2 inline-block bg-muted px-1.5 py-0.5 rounded text-[10px]">{brancheLabel}</span>
            )}
          </p>
        </div>
        {campaign.is_featured && <Star className="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" />}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <BigMetric label="ROAS" value={m.roas != null ? `${Number(m.roas).toFixed(1)}x` : "—"} highlight={tier === "excellent"} />
        <BigMetric label="CPL" value={m.cpl != null ? `€${Number(m.cpl).toFixed(2)}` : "—"} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs border-t border-border pt-3 tabular-nums">
        <SecondaryMetric label="Leads" value={m.leads != null ? Number(m.leads).toLocaleString("de-DE") : "—"} />
        <SecondaryMetric label="Spend" value={m.spend != null ? `€${(Number(m.spend) / 1000).toFixed(1)}k` : "—"} />
        <SecondaryMetric label="CTR" value={m.ctr != null ? `${Number(m.ctr).toFixed(1)}%` : "—"} />
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 tabular-nums">
        {fmtPeriod(campaign.campaign_period_start, campaign.campaign_period_end)}
        {(campaign.total_ads_count ?? 0) > 0 && ` · ${campaign.total_ads_count} Ads`}
      </p>
    </Link>
  );
}

function BigMetric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded ${highlight ? "bg-emerald-500/15" : "bg-muted/60"}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${highlight ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</p>
    </div>
  );
}

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
