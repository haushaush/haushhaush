import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, Trash2, Save, Loader2, X, Plus, Sparkles,
  Share2, Pencil, Copy, ExternalLink, BarChart3, Building2, Target, Facebook,
  Tag, Briefcase, Calendar, Layers, Hash,
} from "lucide-react";
import type { CampaignRow } from "./AdPerformance";
import type { FilterCategory, FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";

type LinkedKunde = { id?: string; client_name?: string; unternehmen?: string; branche?: string } | null;

function fmtPeriod(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const f = (s: string | null) => s ? new Date(s).toLocaleDateString("de-DE") : "—";
  return `${f(start)} – ${end ? f(end) : "heute"}`;
}

function fmtRelative(s: string | null) {
  if (!s) return null;
  const diff = Date.now() - new Date(s).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `vor ${mins} Min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std`;
  const days = Math.round(hrs / 24);
  return `vor ${days} Tg`;
}

export default function AdPerformanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { toast } = useToast();

  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [kunden, setKunden] = useState<{ id: string; client_name: string }[]>([]);

  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customSetupNotes, setCustomSetupNotes] = useState("");
  const [customResultsSummary, setCustomResultsSummary] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [linkedKundeId, setLinkedKundeId] = useState<string | null>(null);
  const [isFeatured, setIsFeatured] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: row }, { data: cats }, { data: opts }, { data: kds }] = await Promise.all([
      supabase.from("referenz_meta_campaigns" as any)
        .select("*, linked_kunde:close_deals(id, client_name, unternehmen, branche)")
        .eq("id", id).maybeSingle(),
      supabase.from("showcase_filter_categories" as any).select("*").in("applies_to", ["kampagne", "all", "both"]).eq("is_active", true).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").eq("is_active", true).order("display_order"),
      supabase.from("close_deals").select("id, client_name").order("client_name").limit(500),
    ]);
    if (!row) { setLoading(false); return; }
    const r = row as any as CampaignRow;
    setCampaign(r);
    setCustomTitle(r.custom_title ?? "");
    setCustomDescription(r.custom_description ?? "");
    setCustomSetupNotes(r.custom_setup_notes ?? "");
    setCustomResultsSummary(r.custom_results_summary ?? "");
    setFilterValues(r.filter_values ?? {});
    setTags(r.custom_tags ?? []);
    setLinkedKundeId(r.linked_kunde_id);
    setIsFeatured(r.is_featured);
    setCategories((cats ?? []) as any);
    setOptions((opts ?? []) as any);
    setKunden(((kds ?? []) as any).filter((k: any) => k.client_name));
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!campaign) return;
    setSaving(true);
    const { error } = await supabase.from("referenz_meta_campaigns" as any).update({
      custom_title: customTitle || null,
      custom_description: customDescription || null,
      custom_setup_notes: customSetupNotes || null,
      custom_results_summary: customResultsSummary || null,
      filter_values: filterValues,
      custom_tags: tags,
      linked_kunde_id: linkedKundeId,
      is_featured: isFeatured,
    }).eq("id", campaign.id);
    setSaving(false);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { toast({ title: "Gespeichert" }); load(); }
  };

  const refresh = async () => {
    if (!campaign) return;
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke("meta-campaigns-refresh-metrics", { body: { campaignId: campaign.id } });
    setRefreshing(false);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { toast({ title: `${(data as any)?.refreshed ?? 0} Kampagne aktualisiert` }); load(); }
  };

  const remove = async () => {
    if (!campaign) return;
    if (!confirm("Kampagne aus Showcase entfernen?")) return;
    const { error } = await supabase.from("referenz_meta_campaigns" as any).delete().eq("id", campaign.id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else navigate("/sales/referenz-showcase/ad-performance");
  };

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]); setNewTag("");
  };

  const copyShareLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link kopiert" });
    } catch {
      toast({ title: url });
    }
  };

  if (loading) return <div className="p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!campaign) return <div className="p-10 text-sm text-muted-foreground">Nicht gefunden. <Link className="underline" to="/sales/referenz-showcase/ad-performance">Zurück</Link></div>;

  const m = (campaign.metrics ?? {}) as Record<string, any>;
  const roas = m.roas != null ? Number(m.roas) : 0;
  const cpl = m.cpl != null ? Number(m.cpl) : null;
  const leads = m.leads != null ? Number(m.leads) : null;
  const spend = m.spend != null ? Number(m.spend) : null;

  const tierClass =
    roas >= 4 ? "from-emerald-500 via-emerald-600 to-teal-700"
    : roas >= 2.5 ? "from-blue-500 via-indigo-600 to-purple-700"
    : roas >= 1.5 ? "from-slate-600 via-slate-700 to-slate-800"
    : "from-gray-500 via-gray-600 to-gray-700";

  const showRoas = roas > 0;
  const primaryValue = showRoas ? `${roas.toFixed(1)}x` : cpl != null ? `€${cpl.toFixed(2)}` : leads != null ? String(leads) : "—";
  const primaryLabel = showRoas ? "ROAS" : cpl != null ? "CPL" : "LEADS";

  const linkedKunde = (campaign as any).linked_kunde as LinkedKunde;
  const branche = linkedKunde?.branche || (campaign.filter_values as any)?.branche || "";
  const unternehmen = linkedKunde?.unternehmen || (campaign.filter_values as any)?.unternehmen || "";
  const versicherer = (campaign.custom_tags ?? []).find(t => t.startsWith("versicherer-"))?.replace("versicherer-", "");
  const eyebrow = (linkedKunde?.unternehmen || linkedKunde?.client_name || campaign.meta_account_name || "KAMPAGNE").toUpperCase();
  const dateRange = fmtPeriod(campaign.campaign_period_start, campaign.campaign_period_end);
  const readableTitle = campaign.custom_title
    || (linkedKunde?.client_name && campaign.campaign_period_start
        ? `${linkedKunde.branche || "Kampagne"} · ${new Date(campaign.campaign_period_start).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}`
        : campaign.meta_campaign_name || "Kampagne");

  return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950">
      {/* Sticky Back-Bar */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/sales/referenz-showcase/ad-performance" className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Ad Performance
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copyShareLink}>
              <Share2 className="w-4 h-4 mr-2" /> Teilen
            </Button>
            {isAdmin && (
              <Button variant={editMode ? "default" : "outline"} size="sm" onClick={() => setEditMode(!editMode)}>
                <Pencil className="w-4 h-4 mr-2" /> {editMode ? "Bearbeiten beenden" : "Bearbeiten"}
              </Button>
            )}
            {isAdmin && editMode && (
              <>
                <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Sync
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300" onClick={remove}>
                  <Trash2 className="w-4 h-4 mr-2" /> Löschen
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* LEFT */}
          <div className="lg:col-span-3 space-y-6">
            {/* Gradient Hero */}
            <div className={`bg-gradient-to-br ${tierClass} rounded-2xl shadow-lg overflow-hidden`}>
              <div className="aspect-[16/10] flex flex-col items-center justify-center text-white p-8 relative">
                {campaign.meta_status && (
                  <div className="absolute top-5 right-5 flex items-center gap-2 bg-white/15 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-md uppercase">
                    <span className={`w-1.5 h-1.5 rounded-full ${campaign.meta_status === "ACTIVE" ? "bg-emerald-300 animate-pulse" : "bg-gray-300"}`} />
                    {campaign.meta_status}
                  </div>
                )}
                <div className="text-sm uppercase tracking-widest opacity-70 font-semibold mb-2">{primaryLabel}</div>
                <div className="text-7xl md:text-8xl font-bold leading-none tabular-nums">{primaryValue}</div>
                <div className="flex flex-wrap gap-3 mt-8 justify-center">
                  {showRoas && cpl != null && (
                    <div className="bg-white/15 backdrop-blur-sm rounded-lg px-5 py-3 text-center min-w-[110px]">
                      <div className="text-[10px] uppercase tracking-wider opacity-70">CPL</div>
                      <div className="text-xl font-bold tabular-nums">€{cpl.toFixed(2)}</div>
                    </div>
                  )}
                  <div className="bg-white/15 backdrop-blur-sm rounded-lg px-5 py-3 text-center min-w-[110px]">
                    <div className="text-[10px] uppercase tracking-wider opacity-70">Leads</div>
                    <div className="text-xl font-bold tabular-nums">{leads ?? "—"}</div>
                  </div>
                  {spend != null && (
                    <div className="bg-white/15 backdrop-blur-sm rounded-lg px-5 py-3 text-center min-w-[110px]">
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Spend</div>
                      <div className="text-xl font-bold tabular-nums">€{Math.round(spend).toLocaleString("de-DE")}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {campaign.custom_description && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Beschreibung</h2>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.custom_description}</div>
              </section>
            )}

            {campaign.custom_setup_notes && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Strategie & Setup</h2>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed italic whitespace-pre-wrap">{campaign.custom_setup_notes}</div>
              </section>
            )}

            {campaign.custom_results_summary && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Ergebnisse</h2>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.custom_results_summary}</div>
              </section>
            )}
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Info-Panel */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{eyebrow}</p>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight mb-3">{readableTitle}</h1>
                {(branche || dateRange) && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    {branche && <span className="capitalize">{branche}</span>}
                    {branche && dateRange && <span> · </span>}
                    {dateRange && <span className="tabular-nums">{dateRange}</span>}
                  </div>
                )}
                <Button variant="outline" className="w-full" onClick={copyShareLink}>
                  <Copy className="w-4 h-4 mr-2" /> Link kopieren
                </Button>
              </div>

              {/* Performance-Panel */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <h3 className="font-bold text-gray-900 dark:text-white">Performance</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <PerformanceStat label="Leads" value={leads != null ? String(leads) : "—"} highlight />
                  <PerformanceStat label="CPL" value={cpl != null ? `€${cpl.toFixed(2)}` : "—"} highlight />
                  <PerformanceStat label="ROAS" value={roas > 0 ? `${roas.toFixed(1)}x` : "—"} highlight />
                  <PerformanceStat label="Spend" value={spend != null ? `€${Math.round(spend).toLocaleString("de-DE")}` : "—"} highlight />
                </div>
                <div className="grid grid-cols-3 gap-3 pt-5 border-t border-gray-100 dark:border-gray-800">
                  <PerformanceStat label="Impr." value={m.impressions != null ? Number(m.impressions).toLocaleString("de-DE") : "—"} small />
                  <PerformanceStat label="Klicks" value={m.clicks != null ? Number(m.clicks).toLocaleString("de-DE") : "—"} small />
                  <PerformanceStat label="CTR" value={m.ctr != null ? `${Number(m.ctr).toFixed(2)}%` : "—"} small />
                  <PerformanceStat label="CPM" value={m.cpm != null ? `€${Number(m.cpm).toFixed(2)}` : "—"} small />
                  <PerformanceStat label="Reach" value={m.reach != null ? Number(m.reach).toLocaleString("de-DE") : "—"} small />
                  <PerformanceStat label="Freq." value={m.frequency != null ? Number(m.frequency).toFixed(2) : "—"} small />
                </div>
                <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {dateRange && (
                    <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> <span className="tabular-nums">{dateRange}</span></div>
                  )}
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5" /> {campaign.total_ads_count ?? 0} Ads · {campaign.total_adsets_count ?? 0} Ad Sets
                  </div>
                  {campaign.metrics_last_refreshed_at && (
                    <div className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" /> Sync: {fmtRelative(campaign.metrics_last_refreshed_at)}</div>
                  )}
                </div>
              </div>

              {/* Meta-Panel */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4">Details</h3>
                <div className="space-y-3 text-sm">
                  {linkedKunde?.id && (
                    <DetailRow icon={Building2} label="Kunde">
                      <Link to={`/kunden/${linkedKunde.id}`} className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
                        {linkedKunde.client_name}
                      </Link>
                    </DetailRow>
                  )}
                  {branche && <DetailRow icon={Tag} label="Branche" value={branche} capitalize />}
                  {unternehmen && <DetailRow icon={Briefcase} label="Unternehmen" value={unternehmen} />}
                  {versicherer && <DetailRow icon={Briefcase} label="Versicherer" value={versicherer} capitalize />}

                  {(branche || unternehmen || versicherer || linkedKunde?.id) && (campaign.meta_account_name || campaign.meta_campaign_id) && (
                    <div className="border-t border-gray-100 dark:border-gray-800 my-2" />
                  )}

                  {campaign.meta_account_name && <DetailRow icon={Facebook} label="Meta Account" value={campaign.meta_account_name} />}
                  {campaign.meta_campaign_name && <DetailRow icon={Target} label="Kampagne" value={campaign.meta_campaign_name} />}
                  {campaign.meta_objective && <DetailRow icon={Target} label="Objective" value={campaign.meta_objective.replace("OUTCOME_", "")} />}
                  {campaign.meta_campaign_id && <DetailRow icon={Hash} label="Campaign ID" value={campaign.meta_campaign_id} mono />}
                </div>

                {tags.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Tags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                        <span key={tag} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded-md">#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edit-Form */}
        {isAdmin && editMode && (
          <div className="mt-16 space-y-6">
            {linkedKundeId && (() => {
              const lk = kunden.find(k => k.id === linkedKundeId);
              if (!lk) return null;
              return (
                <div className="border border-primary/30 bg-primary/5 rounded-2xl p-4 text-sm flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Auto-Verknüpfung mit Notion-Kunde</p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                      Diese Kampagne ist mit <strong className="text-gray-900 dark:text-white">{lk.client_name}</strong> verknüpft.
                      Branche, Unternehmen-Tag und Kunden-Tag werden bei jedem Sync automatisch aktualisiert.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Showcase-Daten bearbeiten</h2>
              <div className="space-y-5 max-w-2xl">
                <div>
                  <Label>Titel im Showcase</Label>
                  <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={campaign.meta_campaign_name ?? ""} className="mt-1" />
                </div>
                <div>
                  <Label>Beschreibung</Label>
                  <Textarea value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} rows={3} className="mt-1"
                    placeholder="Kurze Erklärung der Kampagne für Sales-Pitches…" />
                </div>
                <div>
                  <Label>Setup-Notes / Strategie</Label>
                  <Textarea value={customSetupNotes} onChange={(e) => setCustomSetupNotes(e.target.value)} rows={3} className="mt-1"
                    placeholder="Targeting: Lookalike 1% von Lead-Audience, Hook: Question-Style…" />
                </div>
                <div>
                  <Label>Results Summary</Label>
                  <Textarea value={customResultsSummary} onChange={(e) => setCustomResultsSummary(e.target.value)} rows={3} className="mt-1"
                    placeholder='"Beste Kampagne 2025, 4.2x ROAS bei 2766€ Spend…"' />
                </div>

                {categories.length > 0 && (
                  <div className="space-y-2">
                    <Label>Filter</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map(cat => {
                        const catOpts = options.filter(o => o.category_id === cat.id);
                        return (
                          <div key={cat.id}>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{cat.label}</span>
                            <select
                              value={filterValues[cat.key] ?? ""}
                              onChange={(e) => setFilterValues({ ...filterValues, [cat.key]: e.target.value })}
                              className="w-full text-sm bg-background border border-border rounded-md px-2 h-9 mt-0.5"
                            >
                              <option value="">— wählen —</option>
                              {catOpts.map(o => <option key={o.id} value={o.key}>{o.label}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <Label>Tags</Label>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    <Sparkles className="w-3 h-3 inline -mt-0.5" /> Auto-Tags (#kunde-…, #unternehmen-…) werden bei jedem Sync neu generiert.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {tags.map(t => {
                      const isAutoTag = t.startsWith("kunde-") || t.startsWith("unternehmen-") || t.startsWith("versicherer-");
                      return (
                        <span key={t} className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 border ${isAutoTag ? "bg-primary/10 text-primary border-primary/30" : "bg-muted border-transparent"}`}>
                          {isAutoTag && <Sparkles className="w-3 h-3" />}
                          #{t}
                          {!isAutoTag && (
                            <button onClick={() => setTags(tags.filter(x => x !== t))}>
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    <div className="flex items-center gap-1">
                      <Input
                        value={newTag} onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                        placeholder="neuer Tag" className="h-7 w-32 text-xs"
                      />
                      <Button size="icon" variant="ghost" onClick={addTag}><Plus className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Verknüpfter Kunde</Label>
                    <select
                      value={linkedKundeId ?? ""}
                      onChange={(e) => setLinkedKundeId(e.target.value || null)}
                      className="w-full text-sm bg-background border border-border rounded-md px-2 h-9 mt-1"
                    >
                      <option value="">— keiner —</option>
                      {kunden.map(k => <option key={k.id} value={k.id}>{k.client_name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 md:mt-7">
                    <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="featured" />
                    <Label htmlFor="featured" className="cursor-pointer">⭐ Als Featured markieren</Label>
                  </div>
                </div>

                <Button onClick={save} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Speichern
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PerformanceStat({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`font-bold tabular-nums ${
        highlight ? "text-2xl text-teal-600 dark:text-teal-400"
        : small ? "text-sm text-gray-900 dark:text-white"
        : "text-lg text-gray-900 dark:text-white"
      }`}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon, label, value, children, capitalize, mono,
}: {
  icon: any; label: string; value?: string; children?: React.ReactNode; capitalize?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        <div className={`text-gray-900 dark:text-white font-medium truncate ${capitalize ? "capitalize" : ""} ${mono ? "font-mono text-xs" : ""}`}>
          {value ?? children}
        </div>
      </div>
    </div>
  );
}
