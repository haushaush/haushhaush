import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Trash2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BranchePicker } from '@/components/pickers/BranchePicker';
import { UnternehmenPicker } from '@/components/pickers/UnternehmenPicker';

const KUNDENSTATUS = ['Lead', 'In Betreuung', 'Pausiert', 'Churned'] as const;
const AMPEL = ['Grün', 'Gelb', 'Rot', 'CC'] as const;
const ZAHLSTATUS = [
  'Offen', 'In Bearbeitung', 'Rechnung zu erstellen', 'Rechnung nicht versendet',
  'Rechnung versendet', 'Zahlung ausstehend', 'In Mahnung', 'DONE',
];

interface ClientLike {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  branche_id?: string | null;
  unternehmen_id?: string | null;
  kundenstatus?: string | null;
  ampelstatus?: string | null;
  zahlstatus?: string | null;
  notes?: string | null;
  meta_account_id?: string | null;
}

interface Props {
  client: ClientLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function KundenSlidePanel({ client, open, onOpenChange, onSaved }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!client) return;
    setForm({
      name: client.name ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      website: client.website ?? '',
      branche_id: client.branche_id ?? null,
      unternehmen_id: client.unternehmen_id ?? null,
      kundenstatus: client.kundenstatus ?? 'Lead',
      ampelstatus: client.ampelstatus ?? 'Grün',
      zahlstatus: client.zahlstatus ?? '',
      notes: client.notes ?? '',
      meta_account_id: client.meta_account_id ?? '',
    });
  }, [client]);

  if (!client) return null;
  const upd = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const payload: any = { ...form, updated_at: new Date().toISOString() };
    if (payload.zahlstatus === '') payload.zahlstatus = null;
    if (payload.meta_account_id === '') payload.meta_account_id = null;
    const { error } = await supabase.from('clients').update(payload).eq('id', client.id);
    setSaving(false);
    if (error) { toast.error('Fehler beim Speichern', { description: error.message }); return; }
    toast.success('Gespeichert');
    onSaved?.();
  };

  const handleDelete = async () => {
    if (!confirm('Diesen Kunden archivieren? (Soft-Delete — Deals & Verknüpfungen bleiben erhalten)')) return;
    setDeleting(true);
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', client.id);
    setDeleting(false);
    if (error) { toast.error('Fehler beim Löschen', { description: error.message }); return; }
    toast.success('Kunde archiviert');
    onSaved?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3 pr-8">
            <span className="truncate">{form.name || 'Kunde bearbeiten'}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { onOpenChange(false); navigate(`/kunden/${client.id}`); }}
            >
              Details <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.name || ''} onChange={e => upd('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email || ''} onChange={e => upd('email', e.target.value)} />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.phone || ''} onChange={e => upd('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Website</Label>
            <Input value={form.website || ''} onChange={e => upd('website', e.target.value)} />
          </div>

          <div>
            <Label>Branche</Label>
            <BranchePicker value={form.branche_id} onChange={v => upd('branche_id', v)} compact />
          </div>
          <div>
            <Label>Unternehmen</Label>
            <UnternehmenPicker value={form.unternehmen_id} onChange={v => upd('unternehmen_id', v)} compact />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kundenstatus</Label>
              <Select value={form.kundenstatus || 'Lead'} onValueChange={v => upd('kundenstatus', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KUNDENSTATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ampel</Label>
              <Select value={form.ampelstatus || 'Grün'} onValueChange={v => upd('ampelstatus', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AMPEL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Zahlstatus</Label>
            <Select value={form.zahlstatus || ''} onValueChange={v => upd('zahlstatus', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{ZAHLSTATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label>Meta Account ID</Label>
            <Input value={form.meta_account_id || ''} onChange={e => upd('meta_account_id', e.target.value)} placeholder="act_…" />
          </div>

          <div>
            <Label>Notizen</Label>
            <Textarea rows={4} value={form.notes || ''} onChange={e => upd('notes', e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-destructive hover:text-destructive">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Archivieren
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name?.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Speichern
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
