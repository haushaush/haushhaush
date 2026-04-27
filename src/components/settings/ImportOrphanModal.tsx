import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type Rolle = 'admin' | 'account-manager' | 'user';
const ABTEILUNGEN = ['Management', 'Intern', 'Fulfillment', 'Sales', 'Buchhaltung'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  email: string;
  onImported: () => void;
}

export function ImportOrphanModal({ open, onOpenChange, email, onImported }: Props) {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [position, setPosition] = useState('');
  const [abteilung, setAbteilung] = useState('Sales');
  const [rolle, setRolle] = useState<Rolle>('user');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setVorname(''); setNachname(''); setPosition(''); setAbteilung('Sales'); setRolle('user');
  };

  const handleSubmit = async () => {
    if (!vorname.trim() || !nachname.trim()) return toast.error('Vor- und Nachname sind Pflicht');
    if (!position.trim()) return toast.error('Position eingeben');

    // Generate random temp password (the existing auth password will be replaced)
    const tempPwd = 'Tmp' + Math.random().toString(36).slice(-12) + '!A1';

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-team-member', {
        body: {
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim().toLowerCase(),
          password: tempPwd,
          abteilung,
          position: position.trim(),
          rolle,
          startdatum: new Date().toISOString().slice(0, 10),
          permissions: {
            can_view_kunden: true, can_view_close: true, can_view_meta_ads: true,
            can_view_projekte: true, can_view_sales_kpis: true, can_view_fulfillment: false,
            can_view_finanzen: false, can_view_team_hr: false, can_manage_settings: false,
          },
        },
      });

      if (error || (data as any)?.error) {
        toast.error('Import fehlgeschlagen', { description: (data as any)?.error || error?.message });
        return;
      }

      if ((data as any)?.imported) {
        toast.success('Mitarbeiter wurde erfolgreich importiert', {
          description: `Temporäres Passwort: ${tempPwd}`,
        });
      } else {
        toast.success('Mitarbeiter angelegt');
      }
      reset();
      onOpenChange(false);
      onImported();
    } catch (e: any) {
      toast.error('Verbindungsfehler', { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verwaisten User importieren</DialogTitle>
          <DialogDescription>
            Auth-User <span className="font-mono text-foreground">{email}</span> hat kein
            Mitarbeiter-Profil. Vervollständige die Angaben um ihn ins Team zu importieren.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Vorname *</Label>
              <Input value={vorname} onChange={e => setVorname(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Nachname *</Label>
              <Input value={nachname} onChange={e => setNachname(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Position *</Label>
            <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="z.B. Setter" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Abteilung *</Label>
              <Select value={abteilung} onValueChange={setAbteilung}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ABTEILUNGEN.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rolle *</Label>
              <Select value={rolle} onValueChange={v => setRolle(v as Rolle)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Mitarbeiter</SelectItem>
                  <SelectItem value="account-manager">Account-Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Beim Import wird ein neues temporäres Passwort gesetzt und angezeigt.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
