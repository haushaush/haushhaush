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
  RefreshCw, Trash2, Save, Loader2, X, Plus, Video, Image as ImageIcon,
  Sparkles, ExternalLink, BarChart3, DownloadCloud, Info, Flame,
} from "lucide-react";
import type { MetaAdRow } from "./ReferenzWerbeanzeigen";
import type { FilterCategory, FilterOption } from "@/components/sales/ShowcaseFilterManagementModal";
import {
  DetailPageLayout, DetailHero, DetailInfoPanel, InfoSection, InfoSectionTitle,
  DetailRowList, DetailRow, DetailPageSkeleton,
} from "@/components/showcase/DetailPageLayout";
import { DeleteAdDialog } from "@/components/showcase/DeleteAdDialog";
import { getBrancheDisplay, BRANCHEN } from "@/lib/branchen";
import { InlineEditDetailRow, type InlineOption } from "@/components/showcase/InlineEditDetailRow";
import { cn } from "@/lib/utils";

export default function ReferenzWerbeanzeigeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isPublic = useIsPublicView();
  const isAdmin = hasRole("admin") && !isPublic;
  const { toast } = useToast();

  const [ad, setAd] = useState<MetaAdRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [options, setOptions] = useState<FilterOption[]>([]);
  const [kunden, setKunden] = useState<{ id: string; client_name: string }[]>([]);
  const [clientsList, setClientsList] = useState<{ id: string; name: string; unternehmen_id: string | null; unternehmen_name?: string | null }[]>([]);
  const [unternehmenList, setUnternehmenList] = useState<{ id: string; name: string; display_name: string | null }[]>([]);



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
    const [{ data: row }, { data: cats }, { data: opts }, { data: kds }, { data: cls }, { data: unt }] = await Promise.all([
      supabase.from("referenz_meta_ads" as any)
        .select(isPublic ? '*' : '*, linked_kunde:close_deals(id, client_name, unternehmen, branche)')
        .eq("id", id).maybeSingle(),
      supabase.from("showcase_filter_categories" as any).select("*").in("applies_to", ["werbeanzeige", "both", "all"]).eq("is_active", true).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").eq("is_active", true).order("display_order"),
      supabase.from("close_deals").select("id, client_name").order("client_name").limit(500),
      isPublic ? Promise.resolve({ data: [] }) : supabase.from("clients" as any).select("id, name, unternehmen_id, unternehmen:unternehmen_id(display_name, name)").order("name").limit(2000),
      isPublic ? Promise.resolve({ data: [] }) : supabase.from("unternehmen" as any).select("id, name, display_name").order("name").limit(2000),
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
    setClientsList(((cls ?? []) as any[]).map((c: any) => ({
      id: c.id, name: c.name, unternehmen_id: c.unternehmen_id,
      unternehmen_name: c.unternehmen?.display_name || c.unternehmen?.name || null,
    })));
    setUnternehmenList((unt ?? []) as any);

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const backHref = `${isPublic ? '/showcase' : '/sales/referenz-showcase'}/werbeanzeigen`;

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

  // Soft/hard delete handled via DeleteAdDialog

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]); setNewTag("");
  };

  if (!ad) return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 p-10 text-sm text-gray-500 dark:text-gray-400">
      Nicht gefunden. <Link className="underline" to={backHref}>Zurück</Link>
    </div>
  );

  const m = ad.meta_metrics ?? {};
  const isVideo = ad.ad_format === "video" || ad.ad_format === "reel" || !!ad.video_url;
  const formatLabel = isVideo ? "Video" : ad.ad_format === "carousel" ? "Carousel" : "Bild";
  const linkedKunde = (ad as any).linked_kunde as { id?: string; client_name?: string; unternehmen?: string; branche?: string } | null;
  const eyebrow = linkedKunde?.unternehmen || linkedKunde?.client_name || ad.meta_account_name || "Anzeige";
  const title = ad.custom_title || ad.meta_ad_name || "Unbenannt";
  const thumb = (ad as any).thumbnail_url_persisted || ad.thumbnail_url || (ad as any).thumbnail_url_meta;

  const brancheDisplay =
    getBrancheDisplay((ad as any).linked_branche_id, 'long') ||
    (ad as any).linked_branche_id ||
    getBrancheDisplay(linkedKunde?.branche || ad.filter_values?.branche, 'long') ||
    linkedKunde?.branche || ad.filter_values?.branche || "";
  const unternehmenDisplay = linkedKunde?.unternehmen || ad.filter_values?.unternehmen || "";
  const kundeDisplay = linkedKunde?.client_name || "";

  const cpl = m.cpl != null ? Number(m.cpl) : null;
  const isWinning = !!(cpl != null && cpl > 0 && cpl < 5);

  // Local upsized metric (+15% vs MetricLarge: text-2xl -> text-[28px])
  const BigMetric = ({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) => (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={cn(
        "text-[28px] font-extrabold tabular-nums leading-none",
        highlight ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white",
      )}>{value}</div>
    </div>
  );

  // Local read-only row, upscaled to text-base (+15% vs text-sm)
  const BigRow = ({ label, value, capitalize }: { label: string; value: React.ReactNode; capitalize?: boolean }) => (
    <div className="flex justify-between items-center gap-4 py-1.5">
      <dt className="text-base text-gray-500 dark:text-gray-400 font-medium shrink-0">{label}</dt>
      <dd className={cn("text-base text-right truncate min-w-0 max-w-[60%] font-semibold text-gray-900 dark:text-white", capitalize && "capitalize")}>{value}</dd>
    </div>
  );

  return (
    <>
    <DetailPageLayout
      backHref={backHref}
      backLabel="Anzeigen"
      isAdmin={isAdmin}
      editMode={editMode}
      onEditToggle={() => setEditMode(!editMode)}
      editActions={
        <>
          <Button variant="outline" size="sm" onClick={() => refresh(false)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Sync
          </Button>
          <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing}>
            <DownloadCloud className="w-3.5 h-3.5 mr-1.5" /> Force
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="text-red-600 dark:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      }
      hero={
        <DetailHero aspect="square">
          {ad.video_url ? (
            <video src={ad.video_url} poster={thumb || undefined} controls preload="metadata" className="w-full h-full object-contain bg-black" />
          ) : thumb ? (
            <img src={thumb} alt={title} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isVideo ? <Video className="w-12 h-12 text-gray-300 dark:text-gray-600" /> : <ImageIcon className="w-12 h-12 text-gray-300 dark:text-gray-600" />}
            </div>
          )}
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-purple-600/95 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md">
            {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
            {formatLabel}
          </div>
          {isWinning && (
            <div className="absolute top-4 left-4 flex items-center gap-1 bg-emerald-500/95 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-md">
              <Flame className="w-3 h-3" /> Top
            </div>
          )}
        </DetailHero>
      }
      infoPanel={
        <DetailInfoPanel>
          <InfoSection>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em] mb-1.5">
              {eyebrow}
            </p>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-tight tracking-tight">
              {title}
            </h1>
          </InfoSection>

          {(m.leads != null || m.cpl != null || m.ctr != null || m.spend != null) && (
            <InfoSection>
              <InfoSectionTitle icon={BarChart3}>Performance</InfoSectionTitle>
              <div className="grid grid-cols-2 gap-5">
                <BigMetric label="CPL" value={cpl != null ? `€${cpl.toFixed(2)}` : '—'} highlight={isWinning} />
                <BigMetric label="Leads" value={m.leads != null ? Number(m.leads).toLocaleString('de-DE') : '—'} />
                <BigMetric label="CTR" value={m.ctr != null ? `${Number(m.ctr).toFixed(2)}%` : '—'} />
                <BigMetric label="Budget" value={m.spend != null ? `€${Math.round(Number(m.spend)).toLocaleString('de-DE')}` : '—'} />
              </div>
              {ad.campaign_period_start && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  {ad.campaign_period_start} – {ad.campaign_period_end ?? "heute"}
                </p>
              )}
            </InfoSection>
          )}

          <InfoSection>
            <InfoSectionTitle icon={Info}>Details</InfoSectionTitle>
            <DetailRowList>
              <BigRow label="Branche" value={brancheDisplay || <span className="text-gray-400 italic font-normal">— nicht gesetzt —</span>} />
              <BigRow label="Unternehmen" value={unternehmenDisplay || <span className="text-gray-400 italic font-normal">— nicht gesetzt —</span>} />
              <BigRow label="Kunde" value={kundeDisplay || <span className="text-gray-400 italic font-normal">— nicht gesetzt —</span>} />
              <BigRow label="Format" value={formatLabel} />
              {ad.meta_account_name && <BigRow label="Account" value={ad.meta_account_name} />}
              {ad.meta_campaign_name && <BigRow label="Kampagne" value={ad.meta_campaign_name} />}
            </DetailRowList>
          </InfoSection>

          {(ad as any).meta_permalink_url && (
            <InfoSection>
              <a
                href={(ad as any).meta_permalink_url}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                In Meta Ads Library ansehen
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </InfoSection>
          )}
        </DetailInfoPanel>
      }
      belowContent={
        <>
          {ad.custom_description && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-4">Beschreibung</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{ad.custom_description}</p>
            </section>
          )}
          {(ad as any).custom_performance_notes && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-3">Insights</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic whitespace-pre-wrap">{(ad as any).custom_performance_notes}</p>
            </section>
          )}
          {tags.length > 0 && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-4">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => {
                  const isAutoTag = t.startsWith("kunde-") || t.startsWith("unternehmen-") || t.startsWith("versicherer-");
                  return (
                    <span key={t} className={`text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1 border ${isAutoTag ? "bg-primary/10 text-primary border-primary/30" : "bg-muted border-transparent text-muted-foreground"}`}>
                      {isAutoTag && <Sparkles className="w-3 h-3" />}#{t}
                    </span>
                  );
                })}
              </div>
            </section>
          )}
        </>
      }
      editForm={
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
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
              <Textarea value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} rows={2} className="mt-1" placeholder="Hook funktioniert sehr gut…" />
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
                <Sparkles className="w-3 h-3 inline -mt-0.5" /> Auto-Tags werden bei jedem Sync neu generiert.
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
      }
    />
    {ad && (
      <DeleteAdDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        adIds={[ad.id]}
        adLabel={ad.custom_title || ad.meta_ad_name || undefined}
        onDeleted={() => navigate(backHref)}
      />
    )}
    </>
  );
}
