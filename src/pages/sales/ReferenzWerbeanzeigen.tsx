import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPublicView } from "@/hooks/useIsPublicView";
import { Plus, Settings2, Sparkles, Loader2 } from "lucide-react";
import { MetaAdImportModal } from "@/components/sales/MetaAdImportModal";
import { ShowcaseFilterManagementModal, type FilterCategory, type FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";
import { AdCreativeFilters, ActiveFilterChips, TOP_CPL_THRESHOLDS, type AdFilters } from "@/components/sales/AdCreativeFilters";
import { useToast } from "@/hooks/use-toast";
import {
  ShowcasePageWrapper, SubPageHeader, ShowcaseSearchInput, DropdownPill,
  ShowcaseCard, ShowcaseEmptyState, ResultCount, PrimaryActionButton, SecondaryActionButton,
  type AnyItem,
} from "./ReferenzShowcaseUI";

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
  linked_kunde?: { client_name?: string; unternehmen?: string; branche?: string } | null;
  is_featured: boolean;
  campaign_period_start: string | null;
  campaign_period_end: string | null;
  sync_strategy?: string | null;
  sync_details?: Record<string, any> | null;
  last_sync_error?: string | null;
  last_synced_at?: string | null;
  imported_at?: string | null;
  created_at?: string | null;
}

type SortKey = "performance" | "created" | "cpl" | "roas" | "leads" | "spend" | "ctr";

export default function ReferenzWerbeanzeigenPage() {
  const { hasRole } = useAuth();
  const isPublic = useIsPublicView();
  const isAdmin = hasRole("admin") && !isPublic;
  const { toast } = useToast();
  const [reenriching, setReenriching] = useState(false);

  const [rows, setRows] = useState<MetaAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<SortKey>("performance");

  const [importOpen, setImportOpen] = useState(false);
  const [filterMgmtOpen, setFilterMgmtOpen] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: ads }, { data: cats }, { data: opts }] = await Promise.all([
      supabase.from("referenz_meta_ads" as any)
        .select(isPublic ? '*' : '*, linked_kunde:close_deals(client_name, unternehmen, branche)')
        .eq("is_active", true)
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
      r = r.filter(x => (x.filter_values ?? {})[catKey] === val);
    });

    const sorted = [...r];
    sorted.sort((a, b) => {
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
  }, [rows, search, activeFilters, sortBy]);

  const setFilter = (k: string, v: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      if (v) next[k] = v; else delete next[k];
      return next;
    });
  };

  const items: AnyItem[] = useMemo(
    () => filtered.map(a => ({
      ...a,
      _type: 'werbeanzeige' as const,
      metrics: a.meta_metrics,
    })),
    [filtered],
  );

  const hasActiveFilters = !!search || Object.values(activeFilters).some(Boolean);
  const resetFilters = () => { setSearch(''); setActiveFilters({}); };

  return (
    <ShowcasePageWrapper>
      <SubPageHeader
        title="Ad Creatives"
        subtitle="Aus Meta importierte Top-Performer für Sales-Pitches"
        actions={isAdmin && (
          <>
            <SecondaryActionButton
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
              {reenriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Auto-Enrich
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => setFilterMgmtOpen(true)}>
              <Settings2 className="w-4 h-4" /> Filter verwalten
            </SecondaryActionButton>
            <PrimaryActionButton onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4" /> Aus Meta importieren
            </PrimaryActionButton>
          </>
        )}
      />

      <div className="space-y-3 mb-8">
        <ShowcaseSearchInput value={search} onChange={setSearch} placeholder="Suche nach Titel, Tag, Kunde..." />

        <div className="flex flex-wrap items-center gap-3">
          <DropdownPill
            label="Sortieren"
            value={sortBy === 'performance' ? '' : sortBy}
            onChange={v => setSortBy((v || 'performance') as SortKey)}
            options={[
              { value: 'leads', label: 'Meiste Leads' },
              { value: 'cpl', label: 'CPL (niedrig)' },
              { value: 'roas', label: 'ROAS (hoch)' },
              { value: 'created', label: 'Importdatum' },
            ]}
          />
          {categories.map(cat => {
            const catOpts = options
              .filter(o => o.category_id === cat.id && o.is_active)
              .map(o => ({ value: o.key, label: o.label }))
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

      <ResultCount count={filtered.length} singular="Anzeige" plural="Anzeigen" />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <ShowcaseEmptyState
          subtitle={rows.length === 0 ? 'Noch keine Anzeigen importiert.' : undefined}
          action={isAdmin && rows.length === 0 ? (
            <PrimaryActionButton onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4" /> Erste Anzeigen importieren
            </PrimaryActionButton>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 auto-rows-fr">
          {items.map(item => <ShowcaseCard key={item.id} item={item} />)}
        </div>
      )}

      <MetaAdImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <ShowcaseFilterManagementModal open={filterMgmtOpen} onClose={() => setFilterMgmtOpen(false)} onChanged={load} appliesTo="werbeanzeige" />
    </ShowcasePageWrapper>
  );
}
