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
import { ArrowLeft, RefreshCw, Trash2, Save, Loader2, X, Plus, Sparkles, BarChart3 } from "lucide-react";
import type { CampaignRow } from "./AdPerformance";
import type { FilterCategory, FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";

function fmtPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  const f = (s: string | null) => s ? new Date(s).toLocaleDateString("de-DE") : "—";
  return `${f(start)} – ${f(end)}`;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
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
      supabase.from("referenz_meta_campaigns" as any).select("*").eq("id", id).maybeSingle(),
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

  if (loading) return <div className="p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!campaign) return <div className="p-10 text-sm text-muted-foreground">Nicht gefunden. <Link className="underline" to="/sales/referenz-showcase/ad-performance">Zurück</Link></div>;

  const m = campaign.metrics ?? {};

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" onClick={() => navigate("/sales/referenz-showcase/ad-performance")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Ad Performance
        </Button>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Sync
            </Button>
            <Button variant="outline" onClick={remove}>
              <Trash2 className="w-4 h-4 mr-2 text-destructive" /> Löschen
            </Button>
          </div>
        )}
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{campaign.custom_title || campaign.meta_campaign_name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {campaign.meta_account_name ?? campaign.meta_account_id}
          {campaign.meta_objective && <> · {campaign.meta_objective.replace("OUTCOME_", "")}</>}
          {campaign.meta_status && (
            <span className={`ml-2 inline-block text-[10px] px-2 py-0.5 rounded font-medium ${
              campaign.meta_status === "ACTIVE"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}>{campaign.meta_status}</span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Meta Campaign ID: <span className="font-mono">{campaign.meta_campaign_id}</span></p>
      </header>

      {/* Big KPI dashboard */}
      <div className="bg-gradient-to-br from-primary/10 to-card border-2 border-primary/20 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Performance-Übersicht
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <KpiBig label="ROAS" value={m.roas != null ? `${Number(m.roas).toFixed(2)}x` : "—"} sub="Return on Ad Spend" />
          <KpiBig label="CPL" value={m.cpl != null ? `€${Number(m.cpl).toFixed(2)}` : "—"} sub="Cost per Lead" />
          <KpiBig label="Leads" value={m.leads != null ? Number(m.leads).toLocaleString("de-DE") : "—"} sub="Generierte Leads" />
          <KpiBig label="Spend" value={m.spend != null ? `€${Number(m.spend).toLocaleString("de-DE", { maximumFractionDigits: 0 })}` : "—"} sub="Gesamt-Werbebudget" />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm border-t border-primary/20 pt-4 tabular-nums">
          <KpiSmall label="Impressions" value={m.impressions != null ? Number(m.impressions).toLocaleString("de-DE") : "—"} />
          <KpiSmall label="Klicks" value={m.clicks != null ? Number(m.clicks).toLocaleString("de-DE") : "—"} />
          <KpiSmall label="CTR" value={m.ctr != null ? `${Number(m.ctr).toFixed(2)}%` : "—"} />
          <KpiSmall label="CPM" value={m.cpm != null ? `€${Number(m.cpm).toFixed(2)}` : "—"} />
          <KpiSmall label="Reach" value={m.reach != null ? Number(m.reach).toLocaleString("de-DE") : "—"} />
          <KpiSmall label="Frequency" value={m.frequency != null ? Number(m.frequency).toFixed(2) : "—"} />
        </div>
        <div className="mt-4 pt-4 border-t border-primary/20 flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground">
          <span>📅 Zeitraum: <span className="tabular-nums">{fmtPeriod(campaign.campaign_period_start, campaign.campaign_period_end)}</span></span>
          <span className="tabular-nums">{campaign.total_ads_count ?? 0} Ads · {campaign.total_adsets_count ?? 0} Ad Sets</span>
          <span>🔄 Aktualisiert: {fmtDate(campaign.metrics_last_refreshed_at)}</span>
        </div>
      </div>

      {/* Auto-link info */}
      {linkedKundeId && (() => {
        const linkedKunde = kunden.find(k => k.id === linkedKundeId);
        if (!linkedKunde) return null;
        return (
          <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 text-sm flex items-start gap-2 mb-6">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Auto-Verknüpfung mit Notion-Kunde</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Diese Kampagne ist mit <strong className="text-foreground">{linkedKunde.client_name}</strong> verknüpft.
                Branche, Unternehmen-Tag und Kunden-Tag werden bei jedem Sync automatisch aktualisiert.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Editable showcase data */}
      {isAdmin && (
        <div className="border border-border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold">Showcase-Daten</h2>

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
            <Label>Setup-Notes</Label>
            <Textarea value={customSetupNotes} onChange={(e) => setCustomSetupNotes(e.target.value)} rows={3} className="mt-1"
              placeholder="Targeting: Lookalike 1% von Lead-Audience, Hook: Question-Style…" />
          </div>
          <div>
            <Label>Results Summary</Label>
            <Textarea value={customResultsSummary} onChange={(e) => setCustomResultsSummary(e.target.value)} rows={3} className="mt-1"
              placeholder='"Beste Kampagne 2025, 4.2x ROAS bei 2766€ Spend, 40% über Branchenschnitt…"' />
          </div>

          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>Filter</Label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(cat => {
                  const catOpts = options.filter(o => o.category_id === cat.id);
                  return (
                    <div key={cat.id}>
                      <span className="text-xs text-muted-foreground">{cat.label}</span>
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
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <Sparkles className="w-3 h-3 inline -mt-0.5" /> Auto-Tags (#kunde-…, #unternehmen-…) werden bei jedem Sync neu generiert. Manuelle Tags bleiben erhalten.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {tags.map(t => {
                const isAutoTag = t.startsWith("kunde-") || t.startsWith("unternehmen-") || t.startsWith("versicherer-");
                return (
                  <span key={t} className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 border ${
                    isAutoTag ? "bg-primary/10 text-primary border-primary/30" : "bg-muted border-transparent"
                  }`}>
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
      )}
    </div>
  );
}

function KpiBig({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-background/60 rounded-lg p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl md:text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function KpiSmall({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
