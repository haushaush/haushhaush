import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPublicView } from "@/hooks/useIsPublicView";
import { Plus } from "lucide-react";
import { MetaCampaignImportModal } from "@/components/sales/MetaCampaignImportModal";
import { type FilterCategory, type FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";
import { SHOWCASE_COPY } from "@/copy/showcase";
import {
  ShowcasePageWrapper, SubPageHeader, ShowcaseSearchInput, DropdownPill,
  ShowcaseCard, ShowcaseEmptyState, ResultCount, PrimaryActionButton,
  type AnyItem,
} from "./ReferenzShowcaseUI";
import { FK_EMBED_ALL } from "@/lib/showcaseFkSelect";
import { getBrancheDisplay } from "@/lib/branchen";

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
  linked_kunde?: { client_name?: string; unternehmen?: string; branche?: string } | null;
  is_featured: boolean;
}

type SortKey = "best_roas" | "lowest_cpl" | "most_leads" | "highest_spend" | "newest";

export default function AdPerformancePage() {
  const { hasRole } = useAuth();
  const isPublic = useIsPublicView();
  const isAdmin = hasRole("admin") && !isPublic;

  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<SortKey>("best_roas");

  const [importOpen, setImportOpen] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: camps }, { data: cats }, { data: opts }] = await Promise.all([
      supabase.from("referenz_meta_campaigns" as any)
        .select(isPublic ? `*, ${FK_EMBED_ALL}` : `*, linked_kunde:close_deals(client_name, unternehmen, branche), ${FK_EMBED_ALL}`)
        .eq("is_active", true)
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

  const setFilter = (k: string, v: string) =>
    setActiveFilters(p => {
      const n = { ...p };
      if (v) n[k] = v; else delete n[k];
      return n;
    });

  const items: AnyItem[] = useMemo(
    () => filtered.map(c => ({ ...c, _type: 'campaign' as const })),
    [filtered],
  );

  const hasActiveFilters = !!search || Object.values(activeFilters).some(Boolean);
  const resetFilters = () => { setSearch(''); setActiveFilters({}); };

  return (
    <ShowcasePageWrapper>
      <SubPageHeader
        title={SHOWCASE_COPY.adPerformance.title}
        subtitle={SHOWCASE_COPY.adPerformance.description}
        actions={isAdmin && (
          <PrimaryActionButton onClick={() => setImportOpen(true)}>
            <Plus className="w-4 h-4" /> {SHOWCASE_COPY.adPerformance.importLabel}
          </PrimaryActionButton>
        )}
      />

      <div className="space-y-3 mb-8">
        <ShowcaseSearchInput value={search} onChange={setSearch} placeholder="Suche nach Kampagne, Kunde, Beschreibung…" />

        <div className="flex flex-wrap items-center gap-3">
          <DropdownPill
            label="Sortieren"
            value={sortBy === 'best_roas' ? '' : sortBy}
            onChange={v => setSortBy((v || 'best_roas') as SortKey)}
            options={[
              { value: 'lowest_cpl', label: 'Niedrigster CPL' },
              { value: 'most_leads', label: 'Meiste Leads' },
              { value: 'highest_spend', label: 'Höchster Spend' },
              { value: 'newest', label: 'Neueste' },
            ]}
          />
          {categories.map(cat => {
            const isBranche = cat.key.toLowerCase() === 'branche';
            const mapped = options
              .filter(o => o.category_id === cat.id && o.is_active)
              .map(o => ({ value: o.key, label: isBranche ? (getBrancheDisplay(o.label, 'long') ?? o.label) : o.label }));
            const seen = new Set<string>();
            const catOpts = mapped
              .filter(o => { const k = o.label.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; })
              .sort((a, b) => a.label.localeCompare(b.label));
            if (catOpts.length === 0) return null;
            return (
              <DropdownPill
                key={cat.id}
                label={cat.label}
                value={activeFilters[cat.key] ?? ''}
                onChange={v => setFilter(cat.key, v)}
                options={catOpts}
              />
            );
          })}
          {hasActiveFilters && (
            <button onClick={resetFilters} className="ml-auto text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline">
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      <ResultCount count={filtered.length} singular="Kampagne" plural="Kampagnen" />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <ShowcaseEmptyState
          title={rows.length === 0 ? SHOWCASE_COPY.adPerformance.emptyTitle : 'Keine Ergebnisse'}
          subtitle={rows.length === 0 ? SHOWCASE_COPY.adPerformance.emptyDescription : undefined}
          action={isAdmin && rows.length === 0 ? (
            <PrimaryActionButton onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4" /> {SHOWCASE_COPY.adPerformance.importFirstLabel}
            </PrimaryActionButton>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {items.map(item => <ShowcaseCard key={item.id} item={item} />)}
        </div>
      )}

      <MetaCampaignImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    </ShowcasePageWrapper>
  );
}
