import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createBranche } from "@/hooks/useBranchen";
import { getCanonicalBranche } from "@/lib/branche-aliases";

export function AddBrancheDialog({
  open, onClose, existingBranchen, clients, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  existingBranchen: string[];
  clients: { id: string; name: string }[];
  onCreated: (branche: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setShortName(""); setClientId(""); };

  const handleSave = async () => {
    const v = name.trim();
    if (!v) { toast({ title: "Branchen-Name darf nicht leer sein", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const canonical = getCanonicalBranche(v);

      // Check existing in master table
      const { data: existing } = await (supabase as any)
        .from("branchen")
        .select("id, canonical_name")
        .ilike("canonical_name", canonical)
        .is("deleted_at", null)
        .maybeSingle();

      let finalName = canonical;

      if (existing) {
        toast({ title: `Branche "${existing.canonical_name}" existiert bereits` });
        finalName = existing.canonical_name;
      } else {
        const created = await createBranche(v, shortName || null);
        finalName = created.canonical_name;
        toast({ title: `Branche "${finalName}" angelegt`, description: "Zentral gespeichert und überall verfügbar." });
      }

      if (clientId) {
        const { error } = await supabase.from("clients").update({ branche: finalName }).eq("id", clientId);
        if (error) {
          toast({ title: "Kunden-Zuweisung fehlgeschlagen", description: error.message, variant: "destructive" });
        } else {
          const kn = clients.find(c => c.id === clientId)?.name;
          toast({ title: `${finalName} ${kn ? `${kn} zugewiesen` : "zugewiesen"}` });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['branchen-master'] });
      onCreated(finalName);
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Branche anlegen</DialogTitle>
          <DialogDescription>
            Die Branche wird zentral gespeichert und ist überall verfügbar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Branchen-Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Photovoltaik" className="mt-1" autoFocus />
          </div>
          <div>
            <Label>Kurz-Form <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="z.B. PV, TKV" className="mt-1" />
          </div>
          <div>
            <Label>Direkt einem Kunden zuweisen? <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full mt-1 h-9 text-sm bg-background border border-border rounded-md px-2"
            >
              <option value="">— keine Zuweisung —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
