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
  ArrowLeft, RefreshCw, Trash2, Save, Loader2, X, Plus, Video, Image as ImageIcon,
  Sparkles, Share2, Pencil, Copy, ExternalLink, BarChart3, Building2, Target, Facebook, DownloadCloud,
  Tag, Briefcase,
} from "lucide-react";
import type { MetaAdRow } from "./ReferenzWerbeanzeigen";
import type { FilterCategory, FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";

export default function ReferenzWerbeanzeigeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { toast } = useToast();

  const [ad, setAd] = useState<MetaAdRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [kunden, setKunden] = useState<{ id: string; client_name: string }[]>([]);

  // Editable
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [linkedKundeId, setLinkedKundeId] = useState<string | null>(null);
  const [isFeatured, setIsFeatured] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: row }, { data: cats }, { data: opts }, { data: kds }] = await Promise.all([
      supabase.from("referenz_meta_ads" as any)
        .select("*, linked_kunde:close_deals(id, client_name, unternehmen, branche)")
        .eq("id", id).maybeSingle(),
      supabase.from("showcase_filter_categories" as any).select("*").in("applies_to", ["werbeanzeige", "both", "all"]).eq("is_active", true).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").eq("is_active", true).order("display_order"),
      supabase.from("close_deals").select("id, client_name").order("client_name").limit(500),
    ]);
    if (!row) { setLoading(false); return; }
    const r = row as any as MetaAdRow;
    setAd(r);
    setCustomTitle(r.custom_title ?? "");
    setCustomDescription(r.custom_description ?? "");
    setCustomNotes((r as any).custom_performance_notes ?? "");
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
    if (!ad) return;
    setSaving(true);
    const { error } = await supabase.from("referenz_meta_ads" as any).update({
      custom_title: customTitle || null,
      custom_description: customDescription || null,
      custom_performance_notes: customNotes || null,
      filter_values: filterValues,
      custom_tags: tags,
      linked_kunde_id: linkedKundeId,
      is_featured: isFeatured,
    }).eq("id", ad.id);
    setSaving(false);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { toast({ title: "Gespeichert" }); load(); }
  };

  const refresh = async (force = false) => {
    if (!ad) return;
    setRefreshing(true);
    const { data, error } = await supabase.functions.invoke("meta-ads-refresh-metrics", { body: { adId: ad.id, force } });
    setRefreshing(false);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { toast({ title: force ? `Bild + Metriken neu geladen` : `${(data as any)?.refreshed ?? 0} Anzeige aktualisiert` }); load(); }
  };

  const remove = async () => {
    if (!ad) return;
    if (!confirm("Anzeige aus Showcase entfernen?")) return;
    const { error } = await supabase.from("referenz_meta_ads" as any).delete().eq("id", ad.id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else navigate("/sales/referenz-showcase/werbeanzeigen");
  };

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]); setNewTag("");
  };

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link kopiert" });
  };

  if (loading) return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!ad) return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 p-10 text-sm text-gray-500 dark:text-gray-400">
      Nicht gefunden. <Link className="underline" to="/sales/referenz-showcase/werbeanzeigen">Zurück</Link>
    </div>
  );

  const m = ad.meta_metrics ?? {};
  const isVideo = ad.ad_format === "video" || ad.ad_format === "reel" || !!ad.video_url;
  const formatLabel = isVideo ? "Video Ad" : ad.ad_format === "carousel" ? "Carousel Ad" : "Image Ad";
  const linkedKunde = (ad as any).linked_kunde as { id?: string; client_name?: string; unternehmen?: string; branche?: string } | null;
  const eyebrow = linkedKunde?.unternehmen || linkedKunde?.client_name || ad.meta_account_name || "";
  const title = ad.custom_title || ad.meta_ad_name || "Unbenannt";
  const thumb = (ad as any).thumbnail_url_persisted || ad.thumbnail_url || (ad as any).thumbnail_url_meta;
  const versicherer = (ad.custom_tags ?? []).find(t => t.startsWith("versicherer-"))?.replace("versicherer-", "");
  const branche = linkedKunde?.branche || ad.filter_values?.branche || "";
  const unternehmen = linkedKunde?.unternehmen || ad.filter_values?.unternehmen || "";

  return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950">
      {/* Back-Bar */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/sales/referenz-showcase/werbeanzeigen" className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Ad Creatives
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
                <Button variant="outline" size="sm" onClick={() => refresh(false)} disabled={refreshing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Sync
                </Button>
                <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing}>
                  <DownloadCloud className="w-4 h-4 mr-2" /> Force-Sync
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="relative aspect-[16/10] bg-gray-50 dark:bg-gray-800">
                {ad.video_url ? (
                  <video src={ad.video_url} poster={thumb || undefined} controls preload="metadata" className="w-full h-full object-contain bg-black" />
                ) : thumb ? (
                  <img src={thumb} alt={title} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {isVideo ? <Video className="w-12 h-12 text-gray-300 dark:text-gray-600" /> : <ImageIcon className="w-12 h-12 text-gray-300 dark:text-gray-600" />}
                  </div>
                )}
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-purple-600/95 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-md">
                  {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {formatLabel}
                </div>
              </div>
            </div>

            {(ad.custom_description) && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Beschreibung</h2>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{ad.custom_description}</div>
              </section>
            )}

            {(ad as any).custom_performance_notes && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Insights</h2>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed italic whitespace-pre-wrap">{(ad as any).custom_performance_notes}</div>
              </section>
            )}
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Info-Panel */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                {eyebrow && (
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {eyebrow.toUpperCase()}
                  </p>
                )}
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-3">{title}</h1>
                <div className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-1">
                  {formatLabel}
                  {versicherer && <span className="text-gray-400 dark:text-gray-500 font-normal"> · {versicherer}</span>}
                </div>
                {(branche || unternehmen) && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    {branche && <span className="capitalize">{branche}</span>}
                    {branche && unternehmen && <span> · </span>}
                    {unternehmen && <span>{unternehmen}</span>}
                  </div>
                )}

                {(ad as any).meta_permalink_url && (
                  <a
                    href={(ad as any).meta_permalink_url}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3.5 rounded-xl transition-colors mb-3"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Im Meta Ads Library ansehen
                  </a>
                )}
                <Button variant="outline" className="w-full" onClick={copyShareLink}>
                  <Copy className="w-4 h-4 mr-2" /> Link kopieren
                </Button>
              </div>

              {/* Performance-Panel */}
              {(m.leads != null || m.cpl != null || m.ctr != null || m.roas != null || m.spend != null || m.clicks != null) && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-bold text-gray-900 dark:text-white">Performance</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <PerformanceStat label="Leads" value={m.leads != null ? String(m.leads) : "—"} highlight />
                    <PerformanceStat label="CPL" value={m.cpl != null ? `€${Number(m.cpl).toFixed(2)}` : "—"} highlight />
                    <PerformanceStat label="ROAS" value={m.roas != null ? `${Number(m.roas).toFixed(1)}x` : "—"} />
                    <PerformanceStat label="CTR" value={m.ctr != null ? `${Number(m.ctr).toFixed(2)}%` : "—"} />
                    <PerformanceStat label="Spend" value={m.spend != null ? `€${Number(m.spend).toLocaleString("de-DE")}` : "—"} />
                    <PerformanceStat label="Klicks" value={m.clicks != null ? String(m.clicks) : "—"} />
                  </div>
                  {ad.campaign_period_start && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      Zeitraum: {ad.campaign_period_start} – {ad.campaign_period_end ?? "heute"}
                    </p>
                  )}
                </div>
              )}

              {/* Meta-Panel */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4">Details</h3>
                <div className="space-y-3 text-sm">
                  {linkedKunde?.id && (
                    <div className="flex items-start gap-3">
                      <Building2 className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Kunde</div>
                        <Link to={`/kunden/${linkedKunde.id}`} className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
                          {linkedKunde.client_name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {ad.meta_account_name && (
                    <div className="flex items-start gap-3">
                      <Facebook className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Meta Account</div>
                        <div className="text-gray-900 dark:text-white font-medium">{ad.meta_account_name}</div>
                      </div>
                    </div>
                  )}
                  {ad.meta_campaign_name && (
                    <div className="flex items-start gap-3">
                      <Target className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Kampagne</div>
                        <div className="text-gray-900 dark:text-white font-medium">{ad.meta_campaign_name}</div>
                      </div>
                    </div>
                  )}
                  {ad.meta_adset_name && (
                    <div className="flex items-start gap-3">
                      <Target className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Ad Set</div>
                        <div className="text-gray-900 dark:text-white font-medium">{ad.meta_adset_name}</div>
                      </div>
                    </div>
                  )}
                </div>

                {tags.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Tags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                        <span key={tag} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded-md">
                          #{tag}
                        </span>
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
          <div className="mt-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Showcase-Daten bearbeiten</h2>
            <div className="space-y-5 max-w-2xl">
              <div>
                <Label>Titel im Showcase</Label>
                <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={ad.meta_ad_name ?? ""} className="mt-1" />
              </div>
              <div>
                <Label>Beschreibung</Label>
                <Textarea value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} rows={3} className="mt-1" />
              </div>
              <div>
                <Label>Performance Notes</Label>
                <Textarea value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} rows={2} className="mt-1" placeholder="Hook funktioniert sehr gut, CTR liegt 80% über Branchenschnitt..." />
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
                  <Sparkles className="w-3 h-3 inline -mt-0.5" /> Auto-Tags (#kunde-…, #versicherer-…) werden bei jedem Sync neu generiert.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {tags.map(t => {
                    const isAutoTag = t.startsWith("kunde-") || t.startsWith("versicherer-");
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

              <div className="flex items-center gap-3">
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="featured" />
                <Label htmlFor="featured" className="cursor-pointer">⭐ Als Featured markieren</Label>
              </div>

              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PerformanceStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`font-bold tabular-nums ${highlight ? "text-2xl text-teal-600 dark:text-teal-400" : "text-lg text-gray-900 dark:text-white"}`}>
        {value}
      </div>
    </div>
  );
}
