import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setClientId(""); };

  const handleSave = async () => {
    const v = name.trim();
    if (!v) { toast({ title: "Name darf nicht leer sein", variant: "destructive" }); return; }
    if (existingBranchen.some(b => b.toLowerCase() === v.toLowerCase())) {
      toast({ title: `Branche "${v}" existiert bereits` });
      return;
    }
    setSaving(true);
    if (clientId) {
      const { error } = await supabase.from("clients").update({ branche: v }).eq("id", clientId);
      setSaving(false);
      if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
      toast({ title: `Branche "${v}" angelegt`, description: "Kunde wurde zugewiesen." });
    } else {
      setSaving(false);
      toast({ title: `"${v}" angelegt`, description: "Wird persistent, sobald ein Kunde zugewiesen wird." });
    }
    onCreated(v);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Branche anlegen</DialogTitle>
          <DialogDescription>
            Die Branche wird verfügbar, sobald ein Kunde ihr zugewiesen wird. Du kannst Kunden auch im Kunden-Bereich editieren.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Branchen-Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Photovoltaik" className="mt-1" autoFocus />
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
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
