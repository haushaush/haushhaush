import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Trash2, ArrowRight, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BranchePicker } from '@/components/pickers/BranchePicker';
import { UnternehmenPicker } from '@/components/pickers/UnternehmenPicker';

const KUNDENSTATUS = ['Lead', 'Onboarding', 'In Betreuung', 'Follow Up', 'Done', 'Offen', 'Pausiert', 'Churned'] as const;
const AMPEL = ['Grün', 'Gelb', 'Rot', 'AA', 'A', 'BB', 'B', 'CC', 'C'] as const;
const ZAHLSTATUS = [
  'Offen', 'In Bearbeitung', 'Rechnung zu erstellen', 'Rechnung nicht versendet',
  'Rechnung versendet', 'Zahlung ausstehend', 'In Mahnung', 'DONE',
];

interface ClientLike {
  id: string;
  name?: string | null;
  vor_nachname?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  website_url?: string | null;
  branche_id?: string | null;
  unternehmen_id?: string | null;
  kundenstatus?: string | null;
  ampelstatus?: string | null;
  zahlstatus?: string | null;
  notes?: string | null;
  meta_account_id?: string | null;
  meta_account_ids?: string[] | null;
  projekttyp?: string[] | string | null;
  laufzeit?: string | null;
  startdatum?: string | null;
  enddatum?: string | null;
  deadline?: string | null;
  laufzeit_in_14t?: boolean | null;
  clv?: number | null;
  gesamt_saldo?: number | null;
  ads_budget?: number | null;
  cash_collect_offen?: number | null;
  meta_kosten?: number | null;
  crm_kosten?: number | null;
  superchat_kosten?: number | null;
  website_kosten?: number | null;
  notion_id?: string | null;
  notion_url?: string | null;
}

interface Props {
  client: ClientLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const num = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v));
const str = (v: any) => {
  const t = (v ?? '').toString().trim();
  return t === '' ? null : t;
};

function EurInput({ value, onChange }: { value: any; onChange: (v: number | null) => void }) {
  return (
    <div className="relative">
      <Input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="pr-8"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
    </div>
  );
}

export default function KundenSlidePanel({ client, open, onOpenChange, onSaved }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!client) return;
    const pt = Array.isArray(client.projekttyp)
      ? client.projekttyp.join(', ')
      : (client.projekttyp ?? '');
    setForm({
      name: client.name ?? '',
      vor_nachname: client.vor_nachname ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      website_url: client.website_url ?? client.website ?? '',
      branche_id: client.branche_id ?? null,
      unternehmen_id: client.unternehmen_id ?? null,
      meta_account_id: client.meta_account_id ?? '',
      meta_account_ids: client.meta_account_ids ?? [],
      projekttyp: pt,
      kundenstatus: client.kundenstatus ?? 'Lead',
      ampelstatus: client.ampelstatus ?? 'Grün',
      zahlstatus: client.zahlstatus ?? '',
      laufzeit: client.laufzeit ?? '',
      startdatum: client.startdatum ?? '',
      enddatum: client.enddatum ?? '',
      deadline: client.deadline ?? '',
      laufzeit_in_14t: client.laufzeit_in_14t ?? false,
      clv: client.clv ?? null,
      gesamt_saldo: client.gesamt_saldo ?? null,
      ads_budget: client.ads_budget ?? null,
      cash_collect_offen: client.cash_collect_offen ?? null,
      meta_kosten: client.meta_kosten ?? null,
      crm_kosten: client.crm_kosten ?? null,
      superchat_kosten: client.superchat_kosten ?? null,
      website_kosten: client.website_kosten ?? null,
      notes: client.notes ?? '',
      notion_url: client.notion_url ?? '',
    });
  }, [client]);

  if (!client) return null;
  const upd = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const projekttypArr = form.projekttyp
      ? String(form.projekttyp).split(',').map((s: string) => s.trim()).filter(Boolean)
      : null;

    const payload: any = {
      name: str(form.name),
      vor_nachname: str(form.vor_nachname),
      email: str(form.email),
      phone: str(form.phone),
      website_url: str(form.website_url),
      branche_id: form.branche_id || null,
      unternehmen_id: form.unternehmen_id || null,
      meta_account_id: str(form.meta_account_id),
      projekttyp: projekttypArr,
      kundenstatus: str(form.kundenstatus),
      ampelstatus: str(form.ampelstatus),
      zahlstatus: str(form.zahlstatus),
      laufzeit: str(form.laufzeit),
      startdatum: form.startdatum || null,
      enddatum: form.enddatum || null,
      deadline: form.deadline || null,
      laufzeit_in_14t: form.laufzeit_in_14t ?? null,
      clv: num(form.clv),
      gesamt_saldo: num(form.gesamt_saldo),
      ads_budget: num(form.ads_budget),
      cash_collect_offen: num(form.cash_collect_offen),
      meta_kosten: num(form.meta_kosten),
      crm_kosten: num(form.crm_kosten),
      superchat_kosten: num(form.superchat_kosten),
      website_kosten: num(form.website_kosten),
      notes: str(form.notes),
      updated_at: new Date().toISOString(),
    };

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
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
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

        <div className="mt-4 space-y-3">
          {form.notion_url && (
            <a
              href={form.notion_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              In Notion öffnen
            </a>
          )}
          {client.notion_id && (
            <Alert className="py-2">
              <AlertDescription className="text-xs">
                Dieser Kunde wird mit Notion synchronisiert. Änderungen hier werden beim nächsten Sync ggf. überschrieben.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Accordion type="multiple" defaultValue={['stammdaten', 'status']} className="mt-4">
          <AccordionItem value="stammdaten">
            <AccordionTrigger>Stammdaten</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={form.name || ''} onChange={e => upd('name', e.target.value)} />
              </div>
              <div>
                <Label>Vor- & Nachname</Label>
                <Input value={form.vor_nachname || ''} onChange={e => upd('vor_nachname', e.target.value)} />
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
                <Input type="url" value={form.website_url || ''} onChange={e => upd('website_url', e.target.value)} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="zuordnung">
            <AccordionTrigger>Zuordnung</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div>
                <Label>Branche</Label>
                <BranchePicker value={form.branche_id} onChange={v => upd('branche_id', v)} compact />
              </div>
              <div>
                <Label>Unternehmen</Label>
                <UnternehmenPicker value={form.unternehmen_id} onChange={v => upd('unternehmen_id', v)} compact />
              </div>
              <div>
                <Label>Meta Account ID</Label>
                <Input value={form.meta_account_id || ''} onChange={e => upd('meta_account_id', e.target.value)} placeholder="act_…" />
                {Array.isArray(form.meta_account_ids) && form.meta_account_ids.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    +{form.meta_account_ids.length - 1} weitere verknüpfte Accounts
                  </p>
                )}
              </div>
              <div>
                <Label>Projekttyp <span className="text-xs text-muted-foreground">(Komma-getrennt)</span></Label>
                <Input value={form.projekttyp || ''} onChange={e => upd('projekttyp', e.target.value)} placeholder="z.B. Meta Ads, Webseite" />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="status">
            <AccordionTrigger>Status & Ampel</AccordionTrigger>
            <AccordionContent className="space-y-3">
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="zeitraum">
            <AccordionTrigger>Zeitraum & Laufzeit</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div>
                <Label>Laufzeit</Label>
                <Input value={form.laufzeit || ''} onChange={e => upd('laufzeit', e.target.value)} placeholder="z.B. 12 Monate" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Startdatum</Label>
                  <Input type="date" value={form.startdatum || ''} onChange={e => upd('startdatum', e.target.value)} />
                </div>
                <div>
                  <Label>Enddatum</Label>
                  <Input type="date" value={form.enddatum || ''} onChange={e => upd('enddatum', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Deadline</Label>
                <Input type="date" value={form.deadline || ''} onChange={e => upd('deadline', e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="laufzeit_14t"
                  checked={!!form.laufzeit_in_14t}
                  onCheckedChange={v => upd('laufzeit_in_14t', !!v)}
                />
                <Label htmlFor="laufzeit_14t" className="cursor-pointer">Laufzeit endet in 14 Tagen</Label>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="finanzen">
            <AccordionTrigger>Finanzen</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CLV</Label>
                  <EurInput value={form.clv} onChange={v => upd('clv', v)} />
                </div>
                <div>
                  <Label>Gesamt-Saldo</Label>
                  <EurInput value={form.gesamt_saldo} onChange={v => upd('gesamt_saldo', v)} />
                </div>
                <div>
                  <Label>Ads-Budget</Label>
                  <EurInput value={form.ads_budget} onChange={v => upd('ads_budget', v)} />
                </div>
                <div>
                  <Label>Cash Collect offen</Label>
                  <EurInput value={form.cash_collect_offen} onChange={v => upd('cash_collect_offen', v)} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="kosten">
            <AccordionTrigger>Kosten</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Meta-Kosten</Label>
                  <EurInput value={form.meta_kosten} onChange={v => upd('meta_kosten', v)} />
                </div>
                <div>
                  <Label>CRM-Kosten</Label>
                  <EurInput value={form.crm_kosten} onChange={v => upd('crm_kosten', v)} />
                </div>
                <div>
                  <Label>Superchat-Kosten</Label>
                  <EurInput value={form.superchat_kosten} onChange={v => upd('superchat_kosten', v)} />
                </div>
                <div>
                  <Label>Website-Kosten</Label>
                  <EurInput value={form.website_kosten} onChange={v => upd('website_kosten', v)} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="notizen">
            <AccordionTrigger>Notizen & Notion</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div>
                <Label>Notizen</Label>
                <Textarea rows={5} value={form.notes || ''} onChange={e => upd('notes', e.target.value)} />
              </div>
              {client.notion_id && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div><span className="font-medium">Notion-ID:</span> {client.notion_id}</div>
                  {form.notion_url && (
                    <a href={form.notion_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                      <ExternalLink className="h-3 w-3" /> In Notion öffnen
                    </a>
                  )}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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
