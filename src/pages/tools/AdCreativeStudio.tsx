import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Search, ExternalLink, Copy, Sparkles, Loader2, Image, Wand2, Filter } from "lucide-react";
import { format } from "date-fns";

// ─── Constants ───
const BRANCHEN = ["Versicherung PKV", "BU", "Rechtsschutz", "TKV", "Automotive", "Handwerk", "Allfinanz"];
const FORMATE = ["1:1", "9:16", "16:9", "Story"];
const TYPEN = ["Hook", "Offer", "Social Proof", "UGC", "Testimonial"];
const PLATTFORMEN = ["Meta", "TikTok", "Google Display"];
const HOOK_TYPEN = ["Frage", "Aussage", "Statistik", "Testimonial"];

interface FigmaFrame {
  id: string;
  name: string;
  thumbnailUrl: string;
  figmaUrl?: string;
  pageName?: string;
}

interface AdCreative {
  id: string;
  kunde: string | null;
  branche: string | null;
  format: string | null;
  headline: string | null;
  body_copy: string | null;
  cta: string | null;
  figma_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

interface BriefForm {
  kunde: string;
  kundeId: string;
  branche: string;
  produkt: string;
  zielgruppe: string;
  plattform: string;
  format: string;
  hookTyp: string;
  referenzFrame: FigmaFrame | null;
}

interface GeneratedBrief {
  headlines: string[];
  hookText: string;
  bodyCopy: string;
  cta: string;
  primaryColor: string;
  secondaryColor: string;
}

// ─── Tab 1: Referenz-Bibliothek ───
function ReferenzBibliothek({ onSelectFrame }: { onSelectFrame?: (f: FigmaFrame) => void }) {
  const [frames, setFrames] = useState<FigmaFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brancheFilter, setBrancheFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [typFilter, setTypFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchFrames();
  }, []);

  const fetchFrames = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("figma-creatives", {
        body: { action: "list_frames" },
      });
      if (fnError) throw fnError;
      if (data?.error) {
        setError(data.error);
        return;
      }
      setFrames(data?.frames || []);
    } catch (e: any) {
      console.error("Figma fetch error:", e);
      setError("Figma Token fehlt — bitte in Einstellungen → Figma eintragen");
    } finally {
      setLoading(false);
    }
  };

  const filtered = frames.filter((f) => {
    const name = f.name.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (brancheFilter !== "all" && !name.includes(brancheFilter.toLowerCase())) return false;
    if (formatFilter !== "all" && !name.includes(formatFilter.toLowerCase())) return false;
    if (typFilter !== "all" && !name.includes(typFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Suche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Select value={brancheFilter} onValueChange={setBrancheFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Branche" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Branchen</SelectItem>
            {BRANCHEN.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={formatFilter} onValueChange={setFormatFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Format" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Formate</SelectItem>
            {FORMATE.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typFilter} onValueChange={setTypFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Typ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {TYPEN.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-muted-foreground">
          <Image className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-destructive">{error}</p>
          <a href="/einstellungen" className="text-sm text-primary underline mt-2 inline-block">Zu den Einstellungen →</a>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Image className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Keine Referenzen gefunden</p>
          <p className="text-sm mt-1">Passe deine Filter an oder überprüfe den Figma-Token.</p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {filtered.map((frame) => (
            <Card key={frame.id} className="group relative overflow-hidden break-inside-avoid border-border/50 hover:border-primary/30 transition-all duration-200">
              {frame.thumbnailUrl ? (
                <img src={frame.thumbnailUrl} alt={frame.name} className="w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-40 bg-muted flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <p className="text-sm font-medium truncate">{frame.name}</p>
                {frame.pageName && <p className="text-xs text-muted-foreground truncate">{frame.pageName}</p>}
                <div className="flex gap-1 flex-wrap">
                  {BRANCHEN.filter((b) => frame.name.toLowerCase().includes(b.toLowerCase())).map((b) => (
                    <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>
                  ))}
                </div>
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(frame.figmaUrl || `https://www.figma.com/design/9JmO2Q35aHgCxmxzaKw8xi?node-id=${encodeURIComponent(frame.id)}`, "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />In Figma öffnen
                </Button>
                {onSelectFrame && (
                  <Button size="sm" className="w-full" onClick={() => onSelectFrame(frame)}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />Als Vorlage nutzen
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Creative erstellen ───
function CreativeErstellen() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showRefModal, setShowRefModal] = useState(false);
  const [clients, setClients] = useState<{ id: string; client_name: string }[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [brief, setBrief] = useState<BriefForm>({
    kunde: "", kundeId: "", branche: "", produkt: "", zielgruppe: "",
    plattform: "", format: "", hookTyp: "", referenzFrame: null,
  });
  const [generated, setGenerated] = useState<GeneratedBrief | null>(null);

  useEffect(() => {
    supabase.from("close_deals").select("id, client_name").order("client_name").then(({ data }) => {
      setClients(data || []);
    });
  }, []);

  const filteredClients = clients.filter((c) => c.client_name.toLowerCase().includes(clientSearch.toLowerCase()));

  const handleGenerate = async () => {
    if (!brief.kunde || !brief.branche || !brief.produkt) {
      toast.error("Bitte fülle mindestens Kunde, Branche und Produkt aus.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("figma-creatives", {
        body: {
          action: "generate_brief",
          brief: {
            kunde: brief.kunde,
            branche: brief.branche,
            produkt: brief.produkt,
            zielgruppe: brief.zielgruppe,
            plattform: brief.plattform,
            format: brief.format,
            hookTyp: brief.hookTyp,
          },
        },
      });
      if (error) throw error;
      setGenerated(data?.result || null);
      setStep(2);
    } catch (e: any) {
      console.error(e);
      toast.error("Brief konnte nicht generiert werden");
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateInFigma = async () => {
    if (!generated || !brief.referenzFrame) {
      toast.error("Bitte wähle eine Referenz-Vorlage");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("figma-creatives", {
        body: {
          action: "duplicate_and_fill",
          nodeId: brief.referenzFrame.id,
          textReplacements: {
            headline: generated.headlines[0],
            hook: generated.hookText,
            body: generated.bodyCopy,
            cta: generated.cta,
          },
        },
      });
      if (error) throw error;

      // Save to ad_creatives
      if (user?.id) {
        await supabase.from("ad_creatives" as any).insert({
          user_id: user.id,
          kunde: brief.kunde,
          branche: brief.branche,
          format: brief.format,
          headline: generated.headlines[0],
          body_copy: generated.bodyCopy,
          cta: generated.cta,
          figma_url: data?.figmaUrl || null,
          thumbnail_url: data?.thumbnailUrl || null,
          reference_frame_id: brief.referenzFrame.id,
          platform: brief.plattform,
          zielgruppe: brief.zielgruppe,
          produkt: brief.produkt,
          hook_type: brief.hookTyp,
        });
      }

      toast.success("Creative wurde in Figma erstellt!");
      if (data?.figmaUrl) window.open(data.figmaUrl, "_blank");
      setStep(3);
    } catch (e: any) {
      console.error(e);
      toast.error("Figma-Erstellung fehlgeschlagen");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s}
            </div>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-3 text-sm text-muted-foreground">
          {step === 1 ? "Brief ausfüllen" : step === 2 ? "KI-Brief prüfen" : "Fertig"}
        </span>
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kunde</Label>
              <div className="relative">
                <Input placeholder="Kunde suchen..." value={clientSearch || brief.kunde} onChange={(e) => { setClientSearch(e.target.value); setBrief((p) => ({ ...p, kunde: e.target.value, kundeId: "" })); }} />
                {clientSearch && filteredClients.length > 0 && !brief.kundeId && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredClients.slice(0, 10).map((c) => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setBrief((p) => ({ ...p, kunde: c.client_name, kundeId: c.id })); setClientSearch(""); }}>
                        {c.client_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Branche</Label>
              <Select value={brief.branche} onValueChange={(v) => setBrief((p) => ({ ...p, branche: v }))}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>{BRANCHEN.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Produkt / Angebot</Label>
              <Input value={brief.produkt} onChange={(e) => setBrief((p) => ({ ...p, produkt: e.target.value }))} placeholder="z.B. PKV-Wechsel" />
            </div>
            <div className="space-y-2">
              <Label>Zielgruppe</Label>
              <Input value={brief.zielgruppe} onChange={(e) => setBrief((p) => ({ ...p, zielgruppe: e.target.value }))} placeholder="z.B. Selbstständige 30-45" />
            </div>
            <div className="space-y-2">
              <Label>Plattform</Label>
              <Select value={brief.plattform} onValueChange={(v) => setBrief((p) => ({ ...p, plattform: v }))}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>{PLATTFORMEN.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={brief.format} onValueChange={(v) => setBrief((p) => ({ ...p, format: v }))}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>{FORMATE.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hook-Typ</Label>
              <Select value={brief.hookTyp} onValueChange={(v) => setBrief((p) => ({ ...p, hookTyp: v }))}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>{HOOK_TYPEN.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Referenz-Creative</Label>
              <Button variant="outline" className="w-full justify-start" onClick={() => setShowRefModal(true)}>
                {brief.referenzFrame ? brief.referenzFrame.name : "Vorlage wählen..."}
              </Button>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              KI Brief generieren
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && generated && (
        <Card className="p-6 space-y-5">
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Headline-Varianten</Label>
              <div className="mt-2 space-y-2">
                {generated.headlines.map((h, i) => (
                  <div key={i} className="p-3 bg-muted rounded-lg text-sm font-medium">{i + 1}. {h}</div>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Hook-Text</Label>
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm">{generated.hookText}</div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Body Copy</Label>
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">{generated.bodyCopy}</div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">CTA</Label>
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm font-semibold">{generated.cta}</div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Farbempfehlung</Label>
              <div className="mt-2 flex gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg border" style={{ backgroundColor: generated.primaryColor }} />
                  <span className="text-sm font-mono">{generated.primaryColor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg border" style={{ backgroundColor: generated.secondaryColor }} />
                  <span className="text-sm font-mono">{generated.secondaryColor}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>Zurück</Button>
            <Button onClick={handleCreateInFigma} disabled={creating || !brief.referenzFrame}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              In Figma erstellen
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Creative erstellt!</h3>
          <p className="text-muted-foreground text-sm">Dein Creative wurde erfolgreich in Figma angelegt.</p>
          <Button variant="outline" onClick={() => { setStep(1); setGenerated(null); }}>Neues Creative erstellen</Button>
        </Card>
      )}

      {/* Referenz Modal */}
      <Dialog open={showRefModal} onOpenChange={setShowRefModal}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Referenz-Creative wählen</DialogTitle>
          </DialogHeader>
          <ReferenzBibliothek onSelectFrame={(f) => { setBrief((p) => ({ ...p, referenzFrame: f })); setShowRefModal(false); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 3: Meine Creatives ───
function MeineCreatives() {
  const { user } = useAuth();
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("ad_creatives" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCreatives((data as any[]) || []);
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>;

  if (creatives.length === 0)
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Image className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Noch keine Creatives erstellt</p>
        <p className="text-sm mt-1">Wechsle zum Tab "Creative erstellen", um loszulegen.</p>
      </div>
    );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {creatives.map((c) => (
        <Card key={c.id} className="overflow-hidden">
          {c.thumbnail_url ? (
            <img src={c.thumbnail_url} alt={c.headline || ""} className="w-full h-40 object-cover" />
          ) : (
            <div className="h-40 bg-muted flex items-center justify-center">
              <Image className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
          <div className="p-4 space-y-2">
            <p className="font-medium text-sm truncate">{c.headline || "Ohne Headline"}</p>
            <div className="flex gap-1 flex-wrap">
              {c.branche && <Badge variant="secondary" className="text-[10px]">{c.branche}</Badge>}
              {c.format && <Badge variant="outline" className="text-[10px]">{c.format}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{c.kunde} · {format(new Date(c.created_at), "dd.MM.yyyy")}</p>
            {c.figma_url && (
              <Button size="sm" variant="ghost" className="w-full mt-1" onClick={() => window.open(c.figma_url!, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />In Figma öffnen
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ───
export default function AdCreativeStudio() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ad Creative Studio</h1>
        <p className="text-muted-foreground text-sm mt-1">Erstelle datengetriebene Ad Creatives mit KI-gestützten Briefs und Figma-Integration.</p>
      </div>

      <Tabs defaultValue="referenzen" className="w-full">
        <TabsList>
          <TabsTrigger value="referenzen">Referenz-Bibliothek</TabsTrigger>
          <TabsTrigger value="erstellen">Creative erstellen</TabsTrigger>
          <TabsTrigger value="meine">Meine Creatives</TabsTrigger>
        </TabsList>

        <TabsContent value="referenzen" className="mt-6">
          <ReferenzBibliothek />
        </TabsContent>
        <TabsContent value="erstellen" className="mt-6">
          <CreativeErstellen />
        </TabsContent>
        <TabsContent value="meine" className="mt-6">
          <MeineCreatives />
        </TabsContent>
      </Tabs>
    </div>
  );
}
