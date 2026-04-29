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
import { ArrowLeft, RefreshCw, Trash2, Save, Loader2, X, Plus, Video, Sparkles } from "lucide-react";
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
      supabase.from("referenz_meta_ads" as any).select("*").eq("id", id).maybeSingle(),
      supabase.from("showcase_filter_categories" as any).select("*").in("applies_to", ["werbeanzeige", "both"]).eq("is_active", true).order("display_order"),
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

  if (loading) return <div className="p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!ad) return <div className="p-10 text-sm text-muted-foreground">Nicht gefunden. <Link className="underline" to="/sales/referenz-showcase/werbeanzeigen">Zurück</Link></div>;

  const m = ad.meta_metrics ?? {};

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" onClick={() => navigate("/sales/referenz-showcase/werbeanzeigen")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Ad Creatives
        </Button>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refresh(false)} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Sync (Metriken)
            </Button>
            <Button variant="outline" onClick={() => refresh(true)} disabled={refreshing}>
              🖼️ Force-Sync (Bild + Metriken)
            </Button>
            <Button variant="outline" onClick={remove}>
              <Trash2 className="w-4 h-4 mr-2 text-destructive" /> Löschen
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-6">
        {/* Left: thumbnail + Meta data (read-only) */}
        <div className="space-y-3">
          <div
            className="bg-muted rounded-lg overflow-hidden"
            style={{ aspectRatio: ad.ad_format === "reel" ? "9 / 16" : "1 / 1" }}
          >
            {ad.video_url ? (
              <video
                src={ad.video_url}
                poster={(ad as any).thumbnail_url_persisted || ad.thumbnail_url || (ad as any).thumbnail_url_meta || undefined}
                controls
                preload="metadata"
                className="w-full h-full object-contain bg-black"
              />
            ) : ((ad as any).thumbnail_url_persisted || ad.thumbnail_url || (ad as any).thumbnail_url_meta) ? (
              <img
                src={(ad as any).thumbnail_url_persisted || ad.thumbnail_url || (ad as any).thumbnail_url_meta}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Video className="w-12 h-12 text-muted-foreground" /></div>
            )}
          </div>
          <div className="text-xs space-y-1.5">
            <div className="text-muted-foreground">Account</div>
            <div className="font-medium">{ad.meta_account_name ?? ad.meta_account_id}</div>
            <div className="text-muted-foreground pt-1">Kampagne</div>
            <div className="font-medium">{ad.meta_campaign_name ?? "—"}</div>
            <div className="text-muted-foreground pt-1">Ad Set</div>
            <div className="font-medium">{ad.meta_adset_name ?? "—"}</div>
            <div className="text-muted-foreground pt-1">Format</div>
            <div className="font-medium capitalize">{ad.ad_format ?? "—"}</div>
          </div>
        </div>

        {/* Right: metrics + editable */}
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{ad.custom_title || ad.meta_ad_name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Meta Ad ID: <span className="font-mono">{ad.meta_ad_id}</span></p>
          </div>

          {/* Performance */}
          <div className="border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">📊 Performance</h2>
            <div className="grid grid-cols-3 gap-3 text-sm tabular-nums">
              <Stat label="Leads" value={m.leads?.toString() ?? "—"} />
              <Stat label="CPL" value={m.cpl != null ? `€${m.cpl}` : "—"} />
              <Stat label="ROAS" value={m.roas != null ? `${m.roas}x` : "—"} />
              <Stat label="CTR" value={m.ctr != null ? `${m.ctr}%` : "—"} />
              <Stat label="Spend" value={m.spend != null ? `€${m.spend}` : "—"} />
              <Stat label="Klicks" value={m.clicks?.toString() ?? "—"} />
            </div>
            {ad.campaign_period_start && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Zeitraum: {ad.campaign_period_start} – {ad.campaign_period_end}
              </p>
            )}
          </div>

          {/* Auto-link info */}
          {linkedKundeId && (() => {
            const linkedKunde = kunden.find(k => k.id === linkedKundeId);
            if (!linkedKunde) return null;
            return (
              <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 text-sm flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Auto-Verknüpfung mit Notion-Kunde</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Diese Anzeige ist mit <strong className="text-foreground">{linkedKunde.client_name}</strong> verknüpft.
                    Branche, Versicherer-Tag und Kunden-Tag werden bei jedem Sync automatisch aus dem Notion-Kunden aktualisiert.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Editable */}
          {isAdmin && (
            <div className="border border-border rounded-lg p-4 space-y-4">
              <h2 className="text-sm font-semibold">Showcase-Daten</h2>


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
                  <Sparkles className="w-3 h-3 inline -mt-0.5" /> Auto-Tags (#kunde-…, #versicherer-…) werden bei jedem Sync neu generiert. Manuelle Tags bleiben erhalten.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {tags.map(t => {
                    const isAutoTag = t.startsWith("kunde-") || t.startsWith("versicherer-");
                    return (
                      <span
                        key={t}
                        className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 border ${
                          isAutoTag
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-muted border-transparent"
                        }`}
                      >
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
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
