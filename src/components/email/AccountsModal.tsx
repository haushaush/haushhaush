import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Star, AlertCircle, Trash2, Wrench, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface EmailAccount {
  id: string;
  email_address: string;
  display_name: string | null;
  provider: string | null;
  is_default: boolean;
  is_active: boolean;
  last_test_status: string | null;
  last_tested_at: string | null;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
}

interface AccountsModalProps {
  open: boolean;
  onClose: () => void;
  accounts: EmailAccount[];
  onAddNew: () => void;
  onRepair: (account: EmailAccount) => void;
  onChanged: () => void;
  mode?: 'personal' | 'shared';
}

export function AccountsModal({ open, onClose, accounts, onAddNew, onRepair, onChanged, mode = 'personal' }: AccountsModalProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const accountsTable = mode === 'shared' ? 'shared_email_accounts' : 'email_accounts';
  const listFn = mode === 'shared' ? 'shared-imap-list-mailboxes' : 'imap-list-mailboxes';

  const setDefault = async (id: string) => {
    setBusyId(id);
    try {
      await (supabase.from as any)(accountsTable).update({ is_default: false }).eq('is_default', true);
      const { error } = await (supabase.from as any)(accountsTable).update({ is_default: true }).eq('id', id);
      if (error) throw error;
      toast.success('Standard-Konto aktualisiert');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const removeAccount = async (id: string, label: string) => {
    if (!confirm(`Konto "${label}" wirklich entfernen? Alle gecachten Nachrichten werden mitgelöscht.`)) return;
    setBusyId(id);
    try {
      const { error } = await (supabase.from as any)(accountsTable).delete().eq('id', id);
      if (error) throw error;
      toast.success('Konto entfernt');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const testAccount = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke(listFn, { body: { accountId: id } });
      if (error) throw error;
      if (data?.ok) {
        await (supabase.from as any)(accountsTable)
          .update({ last_tested_at: new Date().toISOString(), last_test_status: 'ok', last_test_error: null })
          .eq('id', id);
        toast.success('Verbindung erfolgreich');
      } else {
        await (supabase.from as any)(accountsTable)
          .update({ last_tested_at: new Date().toISOString(), last_test_status: data?.error ?? 'unknown', last_test_error: data?.message ?? null })
          .eq('id', id);
        toast.error(`Verbindung fehlgeschlagen: ${data?.error}`);
      }
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Konten verwalten</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Noch keine Konten verbunden.</p>
          )}
          {accounts.map((a) => {
            const ok = a.last_test_status === 'ok' || !a.last_test_status;
            const smtpMissing = !a.smtp_host;
            return (
              <div
                key={a.id}
                className="flex flex-col gap-2 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'h-2 w-2 rounded-full mt-2 shrink-0',
                    ok ? 'bg-emerald-500' : 'bg-destructive',
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{a.email_address}</span>
                      {a.is_default && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          <Star className="h-3 w-3 fill-current" /> Standard
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.provider || 'Custom'} · {ok ? 'verbunden' : (
                        <span className="text-destructive inline-flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Fehler: {a.last_test_status}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!a.is_default && (
                      <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)} disabled={busyId === a.id} title="Als Standard">
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => testAccount(a.id)} disabled={busyId === a.id}>
                      {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Testen'}
                    </Button>
                    {(!ok || smtpMissing) && (
                      <Button size="sm" variant="outline" onClick={() => onRepair(a)}>
                        <Wrench className="h-3.5 w-3.5 mr-1" /> Reparieren
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeAccount(a.id, a.email_address)} disabled={busyId === a.id}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                {smtpMissing && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 ml-5">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/80">
                      <strong>Versand nicht möglich:</strong> SMTP ist nicht konfiguriert.
                      Klicke auf <em>Reparieren</em>, um SMTP-Server, -Port und -SSL zu hinterlegen.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-border flex justify-between items-center">
          <Button onClick={onAddNew} variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Konto hinzufügen
          </Button>
          <Button onClick={onClose}>Schließen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
