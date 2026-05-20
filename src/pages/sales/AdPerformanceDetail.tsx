import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPublicView } from "@/hooks/useIsPublicView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Trash2, Save, Loader2, X, Plus, Sparkles, Info, TrendingUp,
} from "lucide-react";
import type { CampaignRow } from "./AdPerformance";
import type { FilterCategory, FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";
import {
  DetailPageLayout, DetailHero, DetailInfoPanel, InfoSection, InfoSectionTitle,
  DetailRowList, DetailRow, MetricLarge, DetailPageSkeleton,
} from "@/components/showcase/DetailPageLayout";
import { getBrancheDisplay } from "@/lib/branchen";

type LinkedKunde = { id?: string; client_name?: string; unternehmen?: string; branche?: string } | null;

function fmtPeriod(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const f = (s: string | null) => s ? new Date(s).toLocaleDateString("de-DE") : "—";
  return `${f(start)} – ${end ? f(end) : "heute"}`;
}

export default function AdPerformanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isPublic = useIsPublicView();
  const isAdmin = hasRole("admin") && !isPublic;
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
        .select(isPublic ? '*' : '*, linked_kunde:close_deals(id, client_name, unternehmen, branche)')
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

  const backHref = `${isPublic ? '/showcase' : '/sales/referenz-showcase'}/ad-performance`;

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
    else navigate(backHref);
  };

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]); setNewTag("");
  };

  if (loading) return <DetailPageSkeleton />;
  if (!campaign) return (
    <div className="p-10 text-sm text-muted-foreground">
      Nicht gefunden. <Link className="underline" to={backHref}>Zurück</Link>
    </div>
  );

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
  const eyebrow = linkedKunde?.unternehmen || linkedKunde?.client_name || campaign.meta_account_name || "Kampagne";
  const dateRange = fmtPeriod(campaign.campaign_period_start, campaign.campaign_period_end);
  const readableTitle = campaign.custom_title
    || (linkedKunde?.client_name && campaign.campaign_period_start
        ? `${linkedKunde.branche || "Kampagne"} · ${new Date(campaign.campaign_period_start).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}`
        : campaign.meta_campaign_name || "Kampagne");

  return (
    <DetailPageLayout
      backHref={backHref}
      backLabel="Kampagnen"
      isAdmin={isAdmin}
      editMode={editMode}
      onEditToggle={() => setEditMode(!editMode)}
      editActions={
        <>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Sync
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} className="text-red-600 dark:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      }
      hero={
        <DetailHero aspect="video">
          <div className={`absolute inset-0 bg-gradient-to-br ${tierClass} flex flex-col items-center justify-center text-white p-8`}>
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
        </DetailHero>
      }
      infoPanel={
        <DetailInfoPanel>
          <InfoSection>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em] mb-1.5">{eyebrow}</p>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-tight tracking-tight">{readableTitle}</h1>
            {dateRange && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 tabular-nums">{dateRange}</p>
            )}
          </InfoSection>

          <InfoSection>
            <InfoSectionTitle icon={TrendingUp}>Performance</InfoSectionTitle>
            <div className="grid grid-cols-2 gap-5">
              <MetricLarge label="ROAS" value={roas > 0 ? `${roas.toFixed(1)}x` : "—"} highlight={roas >= 2.5} />
              <MetricLarge label="Leads" value={leads != null ? leads.toLocaleString('de-DE') : "—"} />
              <MetricLarge label="CPL" value={cpl != null ? `€${cpl.toFixed(2)}` : "—"} />
              <MetricLarge label="Budget" value={spend != null ? `€${Math.round(spend).toLocaleString('de-DE')}` : "—"} />
            </div>
          </InfoSection>

          {(m.impressions || m.clicks || m.ctr || m.cpm) && (
            <InfoSection>
              <DetailRowList>
                {m.impressions != null && <DetailRow label="Impressions" value={Number(m.impressions).toLocaleString('de-DE')} />}
                {m.clicks != null && <DetailRow label="Klicks" value={Number(m.clicks).toLocaleString('de-DE')} />}
                {m.ctr != null && <DetailRow label="CTR" value={`${Number(m.ctr).toFixed(2)}%`} />}
                {m.cpm != null && <DetailRow label="CPM" value={`€${Number(m.cpm).toFixed(2)}`} />}
                {m.frequency != null && <DetailRow label="Frequency" value={Number(m.frequency).toFixed(2)} />}
              </DetailRowList>
            </InfoSection>
          )}

          <InfoSection>
            <InfoSectionTitle icon={Info}>Details</InfoSectionTitle>
            <DetailRowList>
              {branche && <DetailRow label="Branche" value={branche} capitalize />}
              {unternehmen && <DetailRow label="Unternehmen" value={unternehmen} />}
              {campaign.meta_account_name && <DetailRow label="Account" value={campaign.meta_account_name} />}
              {campaign.total_ads_count != null && <DetailRow label="Ads" value={`${campaign.total_ads_count} aktiv`} />}
              {campaign.meta_objective && <DetailRow label="Objective" value={campaign.meta_objective.replace("OUTCOME_", "")} />}
            </DetailRowList>
          </InfoSection>
        </DetailInfoPanel>
      }
      belowContent={
        <>
          {campaign.custom_setup_notes && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-3">Strategie</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic whitespace-pre-wrap">{campaign.custom_setup_notes}</p>
            </section>
          )}
          {campaign.custom_description && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-4">Beschreibung</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.custom_description}</p>
            </section>
          )}
          {campaign.custom_results_summary && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-4">Ergebnisse</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.custom_results_summary}</p>
            </section>
          )}
        </>
      }
      editForm={
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
          <div className="space-y-5 max-w-2xl">
            <div>
              <Label>Titel im Showcase</Label>
              <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={campaign.meta_campaign_name ?? ""} className="mt-1" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} rows={3} className="mt-1" />
            </div>
            <div>
              <Label>Setup-Notes / Strategie</Label>
              <Textarea value={customSetupNotes} onChange={(e) => setCustomSetupNotes(e.target.value)} rows={3} className="mt-1" />
            </div>
            <div>
              <Label>Results Summary</Label>
              <Textarea value={customResultsSummary} onChange={(e) => setCustomResultsSummary(e.target.value)} rows={3} className="mt-1" />
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
      }
    />
  );
}
