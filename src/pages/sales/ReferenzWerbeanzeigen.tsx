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

  const [searchParams, setSearchParams] = useSearchParams();

  // Read state from URL
  const search = searchParams.get("q") ?? "";
  const sortBy = (searchParams.get("sort") as SortKey) || "performance";
  const activeFilters: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      if (k.startsWith("f.") && v) out[k.slice(2)] = v;
    });
    return out;
  }, [searchParams]);
  const adFilters: AdFilters = useMemo(() => {
    const f: AdFilters = {};
    if (searchParams.get("has_leads") === "1") f.has_leads = true;
    if (searchParams.get("top") === "1") f.top_performers = true;
    if (searchParams.get("video") === "1") f.has_video = true;
    const cplMin = searchParams.get("cpl_min");
    const cplMax = searchParams.get("cpl_max");
    if (cplMin || cplMax) f.cpl_range = [Number(cplMin ?? 0), Number(cplMax ?? 100)];
    const spMin = searchParams.get("sp_min");
    const spMax = searchParams.get("sp_max");
    if (spMin || spMax) f.spend_range = [Number(spMin ?? 0), Number(spMax ?? 50000)];
    const ml = searchParams.get("min_leads");
    if (ml) f.min_leads = Number(ml);
    const mc = searchParams.get("min_ctr");
    if (mc) f.min_ctr = Number(mc);
    return f;
  }, [searchParams]);

  const updateParams = useCallback((mut: (p: URLSearchParams) => void) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      mut(next);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setSearch = (v: string) =>
    updateParams(p => { v ? p.set("q", v) : p.delete("q"); });
  const setSortBy = (v: SortKey) =>
    updateParams(p => { v && v !== "performance" ? p.set("sort", v) : p.delete("sort"); });
  const setDropdownFilter = (k: string, v: string) =>
    updateParams(p => { v ? p.set(`f.${k}`, v) : p.delete(`f.${k}`); });
  const setAdFilters = (next: AdFilters) =>
    updateParams(p => {
      ["has_leads", "top", "video", "cpl_min", "cpl_max", "sp_min", "sp_max", "min_leads", "min_ctr"].forEach(k => p.delete(k));
      if (next.has_leads) p.set("has_leads", "1");
      if (next.top_performers) p.set("top", "1");
      if (next.has_video) p.set("video", "1");
      if (next.cpl_range) { p.set("cpl_min", String(next.cpl_range[0])); p.set("cpl_max", String(next.cpl_range[1])); }
      if (next.spend_range) { p.set("sp_min", String(next.spend_range[0])); p.set("sp_max", String(next.spend_range[1])); }
      if (next.min_leads != null) p.set("min_leads", String(next.min_leads));
      if (next.min_ctr != null) p.set("min_ctr", String(next.min_ctr));
    });

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

    // Performance / Ad-specific filters
    const num = (v: any): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const ctrPct = (v: any): number | null => {
      const n = num(v);
      if (n == null) return null;
      return n <= 1 ? n * 100 : n;
    };

    r = r.filter(x => {
      const m = x.meta_metrics ?? {};
      const cpl = num(m.cpl);
      const leads = num(m.leads);
      const ctr = ctrPct(m.ctr);
      const spend = num(m.spend);

      if (adFilters.has_leads && !(leads != null && leads > 0)) return false;
      if (adFilters.has_video) {
        const f = (x.ad_format || "").toLowerCase();
        if (f !== "video" && f !== "reel") return false;
      }
      if (adFilters.top_performers) {
        const branche = x.linked_kunde?.branche ?? null;
        const threshold = TOP_CPL_THRESHOLDS[branche || ""] ?? TOP_CPL_THRESHOLDS.default;
        const isTop =
          (cpl != null && cpl < threshold) ||
          (ctr != null && ctr > 3) ||
          (leads != null && leads > 20);
        if (!isTop) return false;
      }
      if (adFilters.cpl_range) {
        const [lo, hi] = adFilters.cpl_range;
        if (cpl == null || cpl < lo || cpl > hi) return false;
      }
      if (adFilters.spend_range) {
        const [lo, hi] = adFilters.spend_range;
        if (spend == null || spend < lo || spend > hi) return false;
      }
      if (adFilters.min_leads != null && (leads ?? 0) < adFilters.min_leads) return false;
      if (adFilters.min_ctr != null && (ctr ?? 0) < adFilters.min_ctr) return false;
      return true;
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
        case "spend": return (bm.spend ?? 0) - (am.spend ?? 0);
        case "ctr": return (bm.ctr ?? 0) - (am.ctr ?? 0);
        case "created":
        default: return 0;
      }
    });
    return sorted;
  }, [rows, search, activeFilters, sortBy, adFilters]);

  const items: AnyItem[] = useMemo(
    () => filtered.map(a => ({
      ...a,
      _type: 'werbeanzeige' as const,
      metrics: a.meta_metrics,
    })),
    [filtered],
  );

  const hasActiveFilters =
    !!search ||
    Object.values(activeFilters).some(Boolean) ||
    Object.keys(adFilters).length > 0;
  const resetFilters = () => updateParams(p => { Array.from(p.keys()).forEach(k => p.delete(k)); });

  const dropdownLabels = useMemo(() => {
    const out: Record<string, { catLabel: string; optLabel: string }> = {};
    categories.forEach(cat => {
      options.filter(o => o.category_id === cat.id).forEach(o => {
        out[`${cat.key}:${o.key}`] = { catLabel: cat.label, optLabel: o.label };
      });
    });
    return out;
  }, [categories, options]);

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
