import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, GripVertical, RefreshCw, Lock, Sparkles } from "lucide-react";

export interface FilterCategory {
  id: string;
  applies_to: "werbeanzeige" | "website" | "kampagne" | "both" | "all";
  key: string;
  label: string;
  display_order: number;
  is_active: boolean;
  is_auto_synced?: boolean;
  synced_from_field?: string | null;
}
export interface FilterOption {
  id: string;
  category_id: string;
  key: string;
  label: string;
  color_hex: string;
  display_order: number;
  is_active: boolean;
  is_auto_synced?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  appliesTo?: "werbeanzeige" | "website" | "kampagne";
}

export function ShowcaseFilterManagementModal({ open, onClose, onChanged, appliesTo = "werbeanzeige" }: Props) {
  const { toast } = useToast();
  const [cats, setCats] = useState<FilterCategory[]>([]);
  const [opts, setOpts] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [newCatLabel, setNewCatLabel] = useState("");
  const [newOptForCat, setNewOptForCat] = useState<string | null>(null);
  const [newOptLabel, setNewOptLabel] = useState("");
  const [newOptColor, setNewOptColor] = useState("#6B7280");

  const runSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-showcase-filters-from-notion");
    setSyncing(false);
    if (error) {
      toast({ title: "Sync fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    const d = data as any;
    toast({
      title: "Filter synchronisiert",
      description: `${d?.added ?? 0} neu · ${d?.reactivated ?? 0} reaktiviert · ${d?.deactivated ?? 0} entfernt`,
    });
    await load();
    onChanged?.();
  };

  const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: o }] = await Promise.all([
      supabase.from("showcase_filter_categories" as any).select("*").in("applies_to", [appliesTo, "both", "all"]).order("display_order"),
      supabase.from("showcase_filter_options" as any).select("*").order("display_order"),
    ]);
    setCats((c ?? []) as any);
    setOpts((o ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, appliesTo]);

  const addCategory = async () => {
    if (!newCatLabel.trim()) return;
    const { error } = await supabase.from("showcase_filter_categories" as any).insert({
      applies_to: appliesTo, label: newCatLabel.trim(), key: slug(newCatLabel), display_order: cats.length + 1,
    });
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { setNewCatLabel(""); await load(); onChanged?.(); }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Kategorie und alle Optionen löschen?")) return;
    const { error } = await supabase.from("showcase_filter_categories" as any).delete().eq("id", id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { await load(); onChanged?.(); }
  };

  const renameCategory = async (id: string, newLabel: string) => {
    if (!newLabel.trim()) return;
    await supabase.from("showcase_filter_categories" as any).update({ label: newLabel.trim() }).eq("id", id);
    await load(); onChanged?.();
  };

  const addOption = async (catId: string) => {
    if (!newOptLabel.trim()) return;
    const { error } = await supabase.from("showcase_filter_options" as any).insert({
      category_id: catId, label: newOptLabel.trim(), key: slug(newOptLabel), color_hex: newOptColor,
      display_order: opts.filter(o => o.category_id === catId).length + 1,
    });
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else { setNewOptLabel(""); setNewOptForCat(null); await load(); onChanged?.(); }
  };

  const deleteOption = async (id: string) => {
    if (!confirm("Option löschen?")) return;
    await supabase.from("showcase_filter_options" as any).delete().eq("id", id);
    await load(); onChanged?.();
  };

  const updateOption = async (id: string, patch: Partial<FilterOption>) => {
    await supabase.from("showcase_filter_options" as any).update(patch).eq("id", id);
    await load(); onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter verwalten</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 -mt-1">
          <p className="text-xs text-muted-foreground">
            Auto-synchronisierte Kategorien werden aus den Notion-Kunden gespeist.
          </p>
          <Button size="sm" variant="outline" onClick={runSync} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            Aus Notion synchronisieren
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Lädt...</div>
        ) : (
          <div className="space-y-5">
            {cats.map((cat) => {
              const catOpts = opts.filter(o => o.category_id === cat.id).sort((a, b) => a.display_order - b.display_order);
              const isAuto = !!cat.is_auto_synced;
              return (
                <div key={cat.id} className={`border rounded-lg p-3 ${isAuto ? "border-primary/30 bg-primary/[0.02]" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        defaultValue={cat.label}
                        className="h-8 w-48 font-medium"
                        onBlur={(e) => { if (e.target.value !== cat.label) renameCategory(cat.id, e.target.value); }}
                      />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {cat.applies_to}
                      </span>
                      {isAuto && (
                        <span
                          title={`Auto-synct aus ${cat.synced_from_field ?? "Notion"}`}
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded"
                        >
                          <Sparkles className="w-3 h-3" /> Auto-Sync
                        </span>
                      )}
                    </div>
                    {!isAuto && (
                      <Button size="icon" variant="ghost" onClick={() => deleteCategory(cat.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1.5 ml-2">
                    {catOpts.map((o) => {
                      const optAuto = !!o.is_auto_synced;
                      return (
                        <div key={o.id} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={o.color_hex}
                            onChange={(e) => updateOption(o.id, { color_hex: e.target.value })}
                            className="w-7 h-7 rounded border border-border cursor-pointer"
                          />
                          <Input
                            defaultValue={o.label}
                            className="h-7 flex-1"
                            onBlur={(e) => { if (e.target.value !== o.label) updateOption(o.id, { label: e.target.value }); }}
                          />
                          {!o.is_active && (
                            <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">inaktiv</span>
                          )}
                          {optAuto ? (
                            <span title="Aus Notion synchronisiert – nicht löschbar" className="w-7 h-7 inline-flex items-center justify-center text-muted-foreground">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <Button size="icon" variant="ghost" onClick={() => deleteOption(o.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      );
                    })}

                    {isAuto ? (
                      <p className="text-[11px] text-muted-foreground pt-1">
                        🔒 Optionen werden automatisch aus <code className="bg-muted px-1 rounded">{cat.synced_from_field}</code> synchronisiert.
                      </p>
                    ) : newOptForCat === cat.id ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input type="color" value={newOptColor} onChange={(e) => setNewOptColor(e.target.value)} className="w-7 h-7 rounded border border-border cursor-pointer" />
                        <Input
                          autoFocus
                          value={newOptLabel}
                          onChange={(e) => setNewOptLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addOption(cat.id); }}
                          placeholder="Optionen-Label"
                          className="h-7 flex-1"
                        />
                        <Button size="sm" onClick={() => addOption(cat.id)}>+</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setNewOptForCat(null); setNewOptLabel(""); }}>×</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-xs h-7 mt-1" onClick={() => setNewOptForCat(cat.id)}>
                        <Plus className="w-3 h-3 mr-1" /> Option hinzufügen
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="border border-dashed border-border rounded-lg p-3 flex items-center gap-2">
              <Input
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                placeholder="Neue Kategorie (z.B. Mood)"
                className="h-9"
              />
              <Button onClick={addCategory}>
                <Plus className="w-4 h-4 mr-1" /> Kategorie
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Kategorien erscheinen als Filter-Chips auf der Ad Creatives-Seite und im Detail-Panel. Du kannst beliebige Kategorien anlegen.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
