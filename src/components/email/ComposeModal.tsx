import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Array<{ id: string; email_address: string; display_name: string | null; is_default: boolean }>;
  defaultAccountId?: string;
  prefill?: {
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
    replyTo?: string;
  };
  onSent?: () => void;
}

export function ComposeModal({ open, onClose, accounts, defaultAccountId, prefill, onSent }: ComposeModalProps) {
  const [accountId, setAccountId] = useState<string>(defaultAccountId ?? '');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountId(defaultAccountId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? '');
      setTo((prefill?.to ?? []).join(', '));
      setCc((prefill?.cc ?? []).join(', '));
      setBcc('');
      setShowCcBcc((prefill?.cc?.length ?? 0) > 0);
      setSubject(prefill?.subject ?? '');
      setBody(prefill?.body ?? '');
    }
  }, [open, prefill, defaultAccountId, accounts]);

  const handleSend = async () => {
    if (!accountId || !to.trim() || !subject.trim() || !body.trim()) {
      toast.error('Bitte Empfänger, Betreff und Nachricht ausfüllen');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('imap-send-message', {
        body: {
          accountId,
          to: to.split(',').map((s) => s.trim()).filter(Boolean),
          cc: cc ? cc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          bcc: bcc ? bcc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          subject,
          text: body,
          replyTo: prefill?.replyTo,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'Versand fehlgeschlagen');
      toast.success('E-Mail gesendet');
      onSent?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Neue Nachricht</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {accounts.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Von</Label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={cn('w-full h-10 rounded-md border border-input bg-background px-3 text-sm')}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name ? `${a.display_name} <${a.email_address}>` : a.email_address}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">An *</Label>
              {!showCcBcc && (
                <button onClick={() => setShowCcBcc(true)} className="text-[11px] text-primary hover:underline">+ Cc/Bcc</button>
              )}
            </div>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="empfaenger@beispiel.de" />
          </div>

          {showCcBcc && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Betreff *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nachricht *</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="resize-y min-h-[200px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-1" /> Abbrechen
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Senden
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
