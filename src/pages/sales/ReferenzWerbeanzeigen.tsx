import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPublicView } from "@/hooks/useIsPublicView";
import { Link } from "react-router-dom";
import { Plus, Upload, Loader2, ArrowUpDown, Tag, User, Building2, Wallet, Image as ImageIcon, Wand2, ShieldOff, RefreshCw, Link2 } from "lucide-react";
import { ZuordnenAccountsModal, buildIncompleteAccounts } from "@/components/sales/ZuordnenAccountsModal";
import { KampagnenZuordnungModal, countCampaignsWithoutBranche } from "@/components/sales/KampagnenZuordnungModal";
import { Layers } from "lucide-react";
import { AddBrancheDialog } from "@/components/sales/AddBrancheDialog";
import { useQueryClient } from "@tanstack/react-query";
import { BulkImportWizard } from "@/components/showcase/BulkImportWizard";
import { type FilterCategory, type FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";
import { AdCreativeFilters, ActiveFilterChips, type AdFilters } from "@/components/sales/AdCreativeFilters";
import { useToast } from "@/hooks/use-toast";
import { SHOWCASE_COPY } from "@/copy/showcase";
import { isTopPerformer, isWithinDays } from "@/lib/topPerformer";
import { getAdLiveStatus, isAdActive } from "@/lib/adStatus";
import { useFilterOptions, type FilterOption as DropdownFilterOption } from "@/hooks/useFilterOptions";
import { normalizeBranche, getBrancheDisplay, getBranche } from "@/lib/branchen";
import { FK_EMBED_ALL, pickBrancheValue, pickBrancheLabel, pickUnternehmenLabel, pickClientId, pickClientName } from "@/lib/showcaseFkSelect";
import { getCanonicalBranche, getBrancheShortName } from "@/lib/branche-aliases";
import { useBranchen } from "@/hooks/useBranchen";
import { SyncStatusBanner } from "@/components/admin/SyncStatusBanner";
import {
  ShowcasePageWrapper, SubPageHeader, ShowcaseSearchInput, DropdownPill,
  ShowcaseCard, ShowcaseEmptyState, PrimaryActionButton, SecondaryActionButton,
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
  const queryClient = useQueryClient();
  const [reenriching, setReenriching] = useState(false);

  const [rows, setRows] = useState<MetaAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blacklist, setBlacklist] = useState<{ scope: string; target_id: string }[]>([]);
  const [clientBranchen, setClientBranchen] = useState<string[]>([]);
  const [clientsList, setClientsList] = useState<{ id: string; name: string }[]>([]);
  const [localBranchen, setLocalBranchen] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("wa-local-branchen-v1") || "[]"); } catch { return []; }
  });
  const [addBrancheOpen, setAddBrancheOpen] = useState(false);

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
    if (searchParams.get("active") === "1") f.is_active = true;
    if (searchParams.get("high_spend") === "1") f.high_spend = true;
    if (searchParams.get("recent") === "1") f.recent = true;
    if (searchParams.get("featured") === "1") f.featured = true;
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

  // Standalone dropdown filters (in addition to dynamic filter_categories)
  const brancheFilter = searchParams.get("branche") ?? "";
  const kundeFilter = searchParams.get("kunde") ?? "";
  const unternehmenFilter = searchParams.get("unternehmen") ?? "";
  const werbekontoFilter = searchParams.get("werbekonto") ?? "";
  const formatFilter = searchParams.get("format") ?? "";

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
  const setStandaloneFilter = (key: string) => (v: string) =>
    updateParams(p => { v ? p.set(key, v) : p.delete(key); });
  const setAdFilters = (next: AdFilters) =>
    updateParams(p => {
      ["has_leads", "top", "video", "active", "high_spend", "recent", "featured",
       "cpl_min", "cpl_max", "sp_min", "sp_max", "min_leads", "min_ctr"].forEach(k => p.delete(k));
      if (next.has_leads) p.set("has_leads", "1");
      if (next.top_performers) p.set("top", "1");
      if (next.has_video) p.set("video", "1");
      if (next.is_active) p.set("active", "1");
      if (next.high_spend) p.set("high_spend", "1");
      if (next.recent) p.set("recent", "1");
      if (next.featured) p.set("featured", "1");
      if (next.cpl_range) { p.set("cpl_min", String(next.cpl_range[0])); p.set("cpl_max", String(next.cpl_range[1])); }
      if (next.spend_range) { p.set("sp_min", String(next.spend_range[0])); p.set("sp_max", String(next.spend_range[1])); }
      if (next.min_leads != null) p.set("min_leads", String(next.min_leads));
      if (next.min_ctr != null) p.set("min_ctr", String(next.min_ctr));
    });

  const [importOpen, setImportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [kampagnenOpen, setKampagnenOpen] = useState(false);

  const campaignsWithoutBranche = useMemo(() => countCampaignsWithoutBranche(rows), [rows]);

  const incompleteAccountsCount = useMemo(() => buildIncompleteAccounts(rows).length, [rows]);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: ads }, { data: cats }, { data: opts }, { data: bl }, { data: cb }, { data: cl }] = await Promise.all([
      supabase.from("referenz_meta_ads" as any)
        .select(isPublic
          ? `*, ${FK_EMBED_ALL}`
          : `*, linked_kunde:close_deals(client_name, unternehmen, branche), ${FK_EMBED_ALL}`)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("is_featured", { ascending: false })
        .order("imported_at", { ascending: false }),
      supabase.from("showcase_filter_categories" as any).select("*")
        .in("applies_to", ["werbeanzeige", "both", "all"]).eq("is_active", true).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").eq("is_active", true).order("display_order"),
      supabase.from("import_blacklist" as any).select("scope, target_id"),
      supabase.from("clients").select("branche").not("branche", "is", null),
      supabase.from("clients").select("id, name").order("name").limit(2000),
    ]);
    setRows(((ads ?? []) as any[]) as MetaAdRow[]);
    setCategories((cats ?? []) as any);
    setOptions((opts ?? []) as any);
    setBlacklist(((bl ?? []) as any[]) as { scope: string; target_id: string }[]);
    const distinctBr = Array.from(new Set(((cb ?? []) as any[])
      .map((r: any) => (r.branche ?? "").toString().trim())
      .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de'));
    setClientBranchen(distinctBr);
    setClientsList(((cl ?? []) as any[]).filter((c: any) => c.name) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const { branchen, unternehmen, kunden, werbekonten } = useFilterOptions('werbeanzeige');

  // Pre-Filter: blacklist + search + dynamische Kategorien (alles AUSSER Standalone-Dropdowns + Ad-Filter)
  const preFiltered = useMemo(() => {
    let r = rows;
    if (blacklist.length) {
      const blAccount = new Set<string>();
      const blCampaign = new Set<string>();
      const blAd = new Set<string>();
      const blKeyword: string[] = [];
      for (const b of blacklist) {
        const id = String(b.target_id);
        if (b.scope === "meta_account") {
          blAccount.add(id);
          blAccount.add(id.replace(/^act_/, ""));
          blAccount.add(`act_${id.replace(/^act_/, "")}`);
        } else if (b.scope === "meta_campaign") blCampaign.add(id);
        else if (b.scope === "meta_ad") blAd.add(id);
        else if (b.scope === "keyword") blKeyword.push(id.toLowerCase());
      }
      r = r.filter((x: any) => {
        if (x.meta_account_id && (blAccount.has(x.meta_account_id) || blAccount.has(String(x.meta_account_id).replace(/^act_/, "")))) return false;
        if (x.meta_campaign_id && blCampaign.has(x.meta_campaign_id)) return false;
        if (x.meta_ad_id && blAd.has(x.meta_ad_id)) return false;
        if (blKeyword.length) {
          const name = (x.meta_ad_name ?? x.custom_title ?? "").toString().toLowerCase();
          if (blKeyword.some(k => name.includes(k))) return false;
        }
        return true;
      });
    }
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
    return r;
  }, [rows, blacklist, search, activeFilters]);

  // Standalone- + Ad-Filter Predikat, mit optionalem Skip für Branche/Kunde
  // (damit Branche/Kunde-Dropdown nach Auswahl nicht nur 1 Option zeigt).
  const passesAdAndStandalone = useCallback((x: MetaAdRow, opts: { skipBranche?: boolean; skipKunde?: boolean } = {}) => {
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
    const m = x.meta_metrics ?? {};
    const cpl = num(m.cpl);
    const leads = num(m.leads);
    const ctr = ctrPct(m.ctr);
    const spend = num(m.spend);
    const fmt = (x.ad_format || "").toLowerCase();

    if (adFilters.has_leads && !(leads != null && leads > 0)) return false;
    if (adFilters.has_video && fmt !== "video" && fmt !== "reel") return false;
    if (adFilters.top_performers && !isTopPerformer(x as any)) return false;
    if (adFilters.is_active && !isAdActive(x as any).active) return false;
    if (adFilters.high_spend && (spend == null || spend < 500)) return false;
    if (adFilters.recent && !isWithinDays(x.imported_at ?? x.created_at ?? null, 30)) return false;
    if (adFilters.featured && !x.is_featured) return false;

    if (!opts.skipBranche && brancheFilter) {
      const label = pickBrancheLabel(x as any) ?? (x.linked_kunde?.branche ?? (x.filter_values ?? {}).branche ?? '');
      const raw = (label ?? '').toString();
      if (brancheFilter === '__none__') {
        if (raw.trim()) return false;
      } else {
        // Compare via alias-folded canonical (case-insensitive). Fallback to legacy normalizeBranche/raw lowercase.
        const canonicalKey = getCanonicalBranche(raw).toLowerCase();
        const legacyCanonical = normalizeBranche(raw);
        const matches =
          canonicalKey === brancheFilter ||
          (legacyCanonical && legacyCanonical === brancheFilter) ||
          raw.trim().toLowerCase() === brancheFilter.toLowerCase();
        if (!matches) return false;
      }
    }
    if (!opts.skipKunde && kundeFilter) {
      if (kundeFilter === '__none__') {
        const xClientId = pickClientId(x as any);
        if (xClientId || x.linked_kunde_id) return false;
      } else {
        const entry = kunden.find(k => k.value === kundeFilter);
        const ids = entry?.allIds ?? [kundeFilter];
        const xClientId = pickClientId(x as any);
        const matchesFk = xClientId && ids.includes(xClientId);
        const matchesLegacy = x.linked_kunde_id && ids.includes(x.linked_kunde_id);
        if (!matchesFk && !matchesLegacy) return false;
      }
    }
    if (unternehmenFilter) {
      const u = (pickUnternehmenLabel(x as any) ?? x.linked_kunde?.unternehmen ?? (x.filter_values ?? {}).unternehmen ?? "").toString();
      if (u !== unternehmenFilter) return false;
    }
    if (werbekontoFilter && x.meta_account_id !== werbekontoFilter) return false;
    if (formatFilter) {
      if (formatFilter === "video" && fmt !== "video" && fmt !== "reel") return false;
      if (formatFilter === "image" && fmt !== "image" && fmt !== "" && fmt !== "single_image") return false;
      if (formatFilter === "carousel" && fmt !== "carousel") return false;
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
  }, [adFilters, brancheFilter, kundeFilter, unternehmenFilter, werbekontoFilter, formatFilter, kunden]);

  const filtered = useMemo(() => {
    const r = preFiltered.filter(x => passesAdAndStandalone(x));
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
  }, [preFiltered, passesAdAndStandalone, sortBy]);

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
    Object.keys(adFilters).length > 0 ||
    !!brancheFilter || !!kundeFilter || !!unternehmenFilter || !!werbekontoFilter || !!formatFilter;
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

  // Master-Branchen aus zentraler branchen-Tabelle (Single Source of Truth)
  const { data: masterBranchen = [] } = useBranchen();
  const masterShortMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of masterBranchen) {
      if (b.short_name) m.set(getCanonicalBranche(b.canonical_name).toLowerCase(), b.short_name);
    }
    return m;
  }, [masterBranchen]);

  // Master-Branchen-Liste = branchen-Tabelle ∪ clients.branche ∪ lokal hinzugefügte, gefaltet auf Canonical (Alias-Mapping).
  const allBranchen = useMemo(() => {
    const byKey = new Map<string, string>();
    const sources: string[] = [
      ...masterBranchen.map(b => b.canonical_name),
      ...clientBranchen,
      ...localBranchen,
    ];
    for (const b of sources) {
      const t = (b ?? "").toString().trim();
      if (!t) continue;
      const canonical = getCanonicalBranche(t);
      const k = canonical.toLowerCase();
      if (!byKey.has(k)) byKey.set(k, canonical);
    }
    return Array.from(byKey.entries()).map(([key, label]) => ({ key, label }));
  }, [masterBranchen, clientBranchen, localBranchen]);

  // Branche-Optionen: Aliase werden auf Canonical zusammengefasst, Counts addiert.
  const brancheOptionsWithNone = useMemo(() => {
    const sourceRows = preFiltered.filter(x => passesAdAndStandalone(x, { skipBranche: true }));
    const counts = new Map<string, number>();
    let noneCount = 0;
    for (const x of sourceRows) {
      const label = pickBrancheLabel(x as any) ?? (x as any).linked_kunde?.branche ?? ((x as any).filter_values ?? {}).branche ?? '';
      const raw = (label ?? '').toString().trim();
      if (!raw) { noneCount += 1; continue; }
      const canonicalKey = getCanonicalBranche(raw).toLowerCase();
      counts.set(canonicalKey, (counts.get(canonicalKey) ?? 0) + 1);
    }
    const merged = new Map<string, { label: string; count: number }>();
    for (const { key, label } of allBranchen) {
      merged.set(key, { label, count: counts.get(key) ?? 0 });
    }
    for (const [key, count] of counts.entries()) {
      if (!merged.has(key)) {
        // Canonical existiert nicht in clients.branche → Label aus Aliases ableiten oder Fallback.
        const fromBranchenConst = getBranche(key);
        // Bei alias-gefalteten Werten: key ist bereits canonical.toLowerCase() — wir brauchen Original-Casing.
        // Rohe Suche aus den Quelldaten: ersten ad nehmen.
        let label = fromBranchenConst?.label ?? '';
        if (!label) {
          for (const x of sourceRows) {
            const lbl = pickBrancheLabel(x as any) ?? '';
            const raw = (lbl ?? '').toString().trim();
            if (!raw) continue;
            if (getCanonicalBranche(raw).toLowerCase() === key) {
              label = getCanonicalBranche(raw);
              break;
            }
          }
        }
        merged.set(key, { label: label || key, count });
      }
    }
    const arr = Array.from(merged.entries()).map(([value, { label, count }]) => {
      const sn = masterShortMap.get(value) ?? getBrancheShortName(label);
      return {
        value,
        label: sn ? `${label} (${sn})` : label,
        count,
      };
    });
    const withCount = arr.filter(o => (o.count ?? 0) > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, 'de'));
    const noCount = arr.filter(o => (o.count ?? 0) === 0).sort((a, b) => a.label.localeCompare(b.label, 'de'));
    const opts: DropdownFilterOption[] = [...withCount, ...noCount];
    if (noneCount > 0) opts.push({ value: '__none__', label: '— Ohne Branche —', count: noneCount });
    return opts;
  }, [preFiltered, passesAdAndStandalone, allBranchen]);

  const brancheStats = useMemo(() => {
    const withAds = brancheOptionsWithNone.filter(o => o.value !== '__none__' && (o.count ?? 0) > 0).length;
    const withoutAds = brancheOptionsWithNone.filter(o => o.value !== '__none__' && (o.count ?? 0) === 0).length;
    return { total: allBranchen.length, withAds, withoutAds };
  }, [brancheOptionsWithNone, allBranchen]);

  // Kunde-Optionen: dynamisch aus Anzeigen, die ALLE anderen Filter (außer Kunde) passieren.
  const kundenOptionsWithNone = useMemo(() => {
    const sourceRows = preFiltered.filter(x => passesAdAndStandalone(x, { skipKunde: true }));
    const byName = new Map<string, DropdownFilterOption>();
    let noneCount = 0;
    for (const x of sourceRows) {
      const id = pickClientId(x as any) ?? (x as any).linked_kunde_id ?? null;
      const name = pickClientName(x as any);
      if (!id || !name) { noneCount += 1; continue; }
      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.count = (existing.count ?? 0) + 1;
        if (!existing.allIds!.includes(id)) existing.allIds!.push(id);
      } else {
        byName.set(key, { value: id, label: name, count: 1, allIds: [id] });
      }
    }
    const opts = Array.from(byName.values()).sort(
      (a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label, 'de'),
    );
    if (noneCount > 0) opts.push({ value: '__none__', label: '— Ohne Kunde —', count: noneCount });
    return opts;
  }, [preFiltered, passesAdAndStandalone]);

  // Diagnose-Banner: Counts spiegeln den Pre-Filter (also alles außer Standalone-Dropdowns + Ad-Filter).
  const diagnostics = useMemo(() => {
    let adsWithoutBranche = 0;
    let adsWithoutKunde = 0;
    for (const x of preFiltered) {
      const fkVal = pickBrancheValue(x as any);
      const raw = (fkVal ?? (x as any).linked_kunde?.branche ?? ((x as any).filter_values ?? {}).branche ?? '').toString().trim();
      if (!raw) adsWithoutBranche += 1;
      const xClientId = pickClientId(x as any);
      const legacy = (x as any).linked_kunde_id;
      if (!xClientId && !legacy) adsWithoutKunde += 1;
    }
    return { total: preFiltered.length, adsWithoutBranche, adsWithoutKunde };
  }, [preFiltered]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshFilters = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['branchen-normalized-for-filter'] });
    await queryClient.invalidateQueries({ queryKey: ['kunden-for-filter'] });
    await queryClient.invalidateQueries({ queryKey: ['werbekonten-for-filter'] });
    await load();
    setRefreshing(false);
    toast({ title: 'Filter neu geladen', description: `${rows.length} Anzeigen` });
  }, [queryClient, toast, rows.length]);

  return (
    <ShowcasePageWrapper>
      <SubPageHeader
        title={SHOWCASE_COPY.werbeanzeigen.title}
        subtitle={SHOWCASE_COPY.werbeanzeigen.description}
        actions={isAdmin && (
          <div className="flex items-center gap-2">
            <SecondaryActionButton disabled={refreshing} onClick={handleRefreshFilters}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Filter neu laden
            </SecondaryActionButton>
            <Link
              to="/admin/import-blacklist"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium shadow-sm transition-colors"
            >
              <ShieldOff className="w-4 h-4" /> Blacklist
            </Link>
            <SecondaryActionButton
              disabled={reenriching}
              onClick={async () => {
                if (!confirm('Alle nicht-zugeordneten Anzeigen automatisch über Werbekonten und Ad-Namen zu Kunden zuordnen?')) return;
                setReenriching(true);
                const { data, error } = await supabase.functions.invoke('rematch-all-ads', {
                  body: { only_unmatched: true, override_manual: false },
                });
                setReenriching(false);
                if (error) {
                  toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
                } else {
                  const s = (data as any)?.stats ?? {};
                  toast({
                    title: 'Auto-Zuordnung fertig',
                    description: `${s.matched_by_account ?? 0} über Werbekonto · ${s.matched_by_keyword ?? 0} aus Ad-Name · ${s.no_match ?? 0} ohne Treffer`,
                  });
                  load();
                }
              }}
            >
              {reenriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Auto-Zuordnen
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => setAssignOpen(true)}>
              <Link2 className="w-4 h-4" /> Zuordnen
              {incompleteAccountsCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 tabular-nums">
                  {incompleteAccountsCount} offen
                </span>
              )}
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => setKampagnenOpen(true)}>
              <Layers className="w-4 h-4" /> Kampagnen-Zuordnung
              {campaignsWithoutBranche > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 tabular-nums">
                  {campaignsWithoutBranche} ohne Branche
                </span>
              )}
            </SecondaryActionButton>
            <PrimaryActionButton onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" /> {SHOWCASE_COPY.werbeanzeigen.importLabel}
            </PrimaryActionButton>
          </div>
        )}
      />

      {isAdmin && <SyncStatusBanner />}

      <div className="space-y-4 mb-8">
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{diagnostics.total}</span> Anzeigen total
          {' · '}
          <button
            type="button"
            onClick={() => setStandaloneFilter('branche')('__none__')}
            className="hover:underline disabled:no-underline disabled:cursor-default"
            disabled={diagnostics.adsWithoutBranche === 0}
          >
            {diagnostics.adsWithoutBranche} ohne Branche
          </button>
          {' · '}
          <button
            type="button"
            onClick={() => setStandaloneFilter('kunde')('__none__')}
            className="hover:underline disabled:no-underline disabled:cursor-default"
            disabled={diagnostics.adsWithoutKunde === 0}
          >
            {diagnostics.adsWithoutKunde} ohne Kunde
          </button>
          {brancheStats.total > 0 && (
            <>
              {' · '}
              <span>
                {brancheStats.total} Branchen in clients
                {' '}
                <span className="text-gray-400">({brancheStats.withAds} mit Anzeigen, {brancheStats.withoutAds} ohne)</span>
              </span>
            </>
          )}
        </div>


        <div className="max-w-2xl mx-auto">
          <ShowcaseSearchInput value={search} onChange={setSearch} placeholder="Suche nach Titel, Tag, Kunde..." />
        </div>

        {/* Equal-width dropdown grid: 6 columns on desktop, all same width */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 max-w-5xl mx-auto">
          <DropdownPill
            label="Sortieren"
            icon={ArrowUpDown}
            value={sortBy === 'performance' ? '' : sortBy}
            onChange={v => setSortBy((v || 'performance') as SortKey)}
            options={[
              { value: 'leads', label: 'Meiste Leads' },
              { value: 'cpl', label: 'Bester CPL' },
              { value: 'ctr', label: 'Höchste CTR' },
              { value: 'spend', label: 'Höchster Spend' },
              { value: 'roas', label: 'ROAS (hoch)' },
              { value: 'created', label: 'Importdatum' },
            ]}
          />
          <DropdownPill
            label="Branche"
            icon={Tag}
            value={brancheFilter}
            onChange={setStandaloneFilter('branche')}
            options={brancheOptionsWithNone}
            onAddNew={isAdmin ? { label: 'Branche hinzufügen', onClick: () => setAddBrancheOpen(true) } : undefined}
          />
          <DropdownPill label="Kunde" icon={User} value={kundeFilter} onChange={setStandaloneFilter('kunde')} options={kundenOptionsWithNone} />

          <DropdownPill label="Unternehmen" icon={Building2} value={unternehmenFilter} onChange={setStandaloneFilter('unternehmen')} options={unternehmen} />
          <DropdownPill label="Werbekonto" icon={Wallet} value={werbekontoFilter} onChange={setStandaloneFilter('werbekonto')} options={werbekonten} />
          <DropdownPill
            label="Format"
            icon={ImageIcon}
            value={formatFilter}
            onChange={setStandaloneFilter('format')}
            options={[
              { value: 'image', label: 'Bild' },
              { value: 'video', label: 'Video' },
              { value: 'carousel', label: 'Karussell' },
            ]}
          />
        </div>

        {/* Dynamic categories: optional second row, equal columns */}
        {(() => {
          const dynCats = categories.filter(cat => !['branche', 'kunde', 'unternehmen', 'zielgruppe', 'format', 'werbekonto'].includes(cat.key.toLowerCase()));
          if (dynCats.length === 0) return null;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 max-w-5xl mx-auto">
              {dynCats.map(cat => {
                const isBranche = cat.key.toLowerCase() === 'branche';
                const catOpts = options
                  .filter(o => o.category_id === cat.id && o.is_active)
                  .map(o => ({ value: o.key, label: isBranche ? (getBrancheDisplay(o.label, 'long') ?? o.label) : o.label }))
                  .sort((a, b) => a.label.localeCompare(b.label));
                if (catOpts.length === 0) return null;
                return (
                  <DropdownPill
                    key={cat.id}
                    label={cat.label}
                    value={activeFilters[cat.key] ?? ''}
                    onChange={v => setDropdownFilter(cat.key, v)}
                    options={catOpts}
                  />
                );
              })}
            </div>
          );
        })()}

        <AdCreativeFilters filters={adFilters} onChange={setAdFilters} />

        <ActiveFilterChips
          search={search}
          dropdownFilters={activeFilters}
          dropdownLabels={dropdownLabels}
          adFilters={adFilters}
          onRemoveSearch={() => setSearch('')}
          onRemoveDropdown={(k) => setDropdownFilter(k, '')}
          onRemoveAdFilter={(k) => {
            const next = { ...adFilters };
            delete next[k];
            setAdFilters(next);
          }}
          onResetAll={resetFilters}
        />
      </div>

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          {hasActiveFilters
            ? `${filtered.length} von ${rows.length} Anzeigen`
            : `${filtered.length} Anzeigen`}
        </p>
      </div>

      {searchParams.get('debug') === 'true' && (
        <div className="mb-6 p-4 rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 font-mono text-xs">
          <h3 className="font-bold mb-2 text-gray-900 dark:text-white">Debug · Ad-Status-Distribution</h3>
          <pre className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{JSON.stringify(
            rows.reduce<Record<string, number>>((acc, ad) => {
              const key = (ad as any).effective_status || (ad as any).status || 'null';
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {}),
            null, 2
          )}</pre>
          <p className="mt-2 text-gray-900 dark:text-white">last_synced_at:</p>
          <pre className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{JSON.stringify({
            with: rows.filter(a => a.last_synced_at).length,
            without: rows.filter(a => !a.last_synced_at).length,
            newest: rows.map(a => a.last_synced_at).filter(Boolean).sort().pop() ?? null,
          }, null, 2)}</pre>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <ShowcaseEmptyState
          title={rows.length === 0 ? SHOWCASE_COPY.werbeanzeigen.emptyTitle : 'Keine Ergebnisse'}
          subtitle={rows.length === 0 ? SHOWCASE_COPY.werbeanzeigen.emptyDescription : 'Keine Treffer für deine Filter.'}
          action={
            rows.length === 0 && isAdmin ? (
              <PrimaryActionButton onClick={() => setImportOpen(true)}>
                <Plus className="w-4 h-4" /> {SHOWCASE_COPY.werbeanzeigen.importFirstLabel}
              </PrimaryActionButton>
            ) : hasActiveFilters ? (
              <button
                onClick={resetFilters}
                className="text-sm font-semibold text-teal-600 dark:text-teal-400 hover:underline"
              >
                Alle zurücksetzen
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 auto-rows-fr">
          {items.map(item => <ShowcaseCard key={item.id} item={item} />)}
        </div>
      )}

      <BulkImportWizard open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <ZuordnenAccountsModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        rows={rows}
        onSaved={load}
      />
      <KampagnenZuordnungModal
        open={kampagnenOpen}
        onClose={() => setKampagnenOpen(false)}
        rows={rows}
        onSaved={load}
      />
      <AddBrancheDialog
        open={addBrancheOpen}
        onClose={() => setAddBrancheOpen(false)}
        existingBranchen={allBranchen.map(b => b.label)}
        clients={clientsList}
        onCreated={(name) => {
          setLocalBranchen(prev => {
            const next = [...prev, name];
            try { localStorage.setItem("wa-local-branchen-v1", JSON.stringify(next)); } catch {}
            return next;
          });
          load();
        }}
      />
    </ShowcasePageWrapper>
  );
}
