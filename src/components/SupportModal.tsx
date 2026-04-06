import { useState, useEffect, useRef, useCallback } from 'react';
import { LifeBuoy, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';

interface ErrorDetails {
  message: string | null;
  stack: string | null;
  code: string | null;
  type: string;
  page_url: string;
  user_agent: string;
  timestamp: string;
  raw_error_string: string | null;
}

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
  errorType: '404' | 'crash' | 'unauthorized' | 'offline';
  error?: Error | null;
  errorDetails: ErrorDetails;
}

const priorityMap: Record<string, string> = {
  crash: 'Hoch',
  '404': 'Niedrig',
  unauthorized: 'Normal',
  offline: 'Normal',
};

export default function SupportModal({ open, onClose, errorType, error, errorDetails }: SupportModalProps) {
  const { user } = useAuth();
  const { displayName } = useProfile();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSuccess(null);
      setSubmitError(null);
      setMessage('');
      if (user) {
        setName(displayName || '');
        setEmail(user.email || '');
      } else {
        setName('');
        setEmail('');
      }
    }
  }, [open, user, displayName]);

  useEffect(() => {
    if (open && !success) {
      const timer = setTimeout(() => {
        if (user && displayName) {
          messageRef.current?.focus();
        } else {
          nameRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, success, user, displayName]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const ticketData = {
        user_id: user?.id || null,
        user_name: name || null,
        user_email: email || null,
        error_type: errorDetails.type,
        error_code: errorDetails.code,
        error_message: errorDetails.message,
        error_stack: errorDetails.stack,
        page_url: errorDetails.page_url,
        user_message: message.trim(),
        priority: priorityMap[errorType] || 'Normal',
      };

      const { data, error: insertError } = await supabase
        .from('support_tickets')
        .insert(ticketData)
        .select('ticket_nr')
        .single();

      if (insertError) throw insertError;

      // Notify via edge function (non-blocking)
      try {
        await supabase.functions.invoke('notify-tech-support', {
          body: {
            ticket_nr: data?.ticket_nr,
            user_name: name,
            user_email: email,
            error_type: errorDetails.type,
            error_code: errorDetails.code,
            error_message: errorDetails.message,
            error_stack: errorDetails.stack,
            page_url: errorDetails.page_url,
            user_message: message.trim(),
            priority: priorityMap[errorType],
            created_at: errorDetails.timestamp,
          },
        });
      } catch {
        // Slack notification failure is non-blocking
      }

      setSuccess(data?.ticket_nr || 'TKT-????');
    } catch {
      setSubmitError('Fehler beim Senden. Bitte schreibe direkt an support@haushhaush.de');
    } finally {
      setSubmitting(false);
    }
  }, [message, name, email, user, errorType, errorDetails, submitting]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" />

      <div className="relative w-full max-w-[480px] bg-card border border-border rounded-[14px] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.18)] max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {success ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="mb-4">
              <CheckCircle2 className="h-12 w-12 text-[#0A9396]" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Ticket erstellt! ✓</h3>
            <p className="text-sm font-mono text-muted-foreground mb-3">Ticket-Nr: {success}</p>
            <p className="text-sm text-muted-foreground mb-6">
              Wir haben dein Ticket erhalten und melden uns bald bei dir.
            </p>
            <Button onClick={onClose} className="w-full max-w-[200px]">Schließen</Button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-6">
              <LifeBuoy className="h-6 w-6 text-[#0A9396] flex-shrink-0 mt-0.5" />
              <div>
                <h3 id="support-modal-title" className="text-lg font-semibold text-foreground">
                  Support kontaktieren
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Beschreibe dein Problem — wir melden uns so schnell wie möglich.
                </p>
              </div>
            </div>

            {/* Auto-captured error details — always visible */}
            <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4 overflow-hidden w-full">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 tracking-wider">
                WIRD AUTOMATISCH MITGESENDET
              </p>
              <div className="flex flex-col gap-1 w-full min-w-0">
                {errorDetails.code && (
                  <span className="text-xs text-muted-foreground">
                    Fehlercode: <code className="text-destructive font-mono">{errorDetails.code}</code>
                  </span>
                )}
                <span className="text-xs text-muted-foreground break-all" style={{ overflowWrap: 'anywhere' }}>
                  Seite: <code className="font-mono text-[11px]">{(() => { try { return new URL(errorDetails.page_url).pathname; } catch { return errorDetails.page_url?.slice(0, 60) + '...' || 'Unbekannt'; } })()}</code>
                </span>
                <span className="text-xs text-muted-foreground">
                  Zeitpunkt: {new Date(errorDetails.timestamp).toLocaleString('de-DE')}
                </span>
                {errorDetails.message && (
                  <div className="mt-2 bg-card border border-destructive/20 rounded-md p-2 font-mono text-[11px] text-destructive max-h-[100px] overflow-y-auto w-full box-border" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                    {errorDetails.message}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Name</label>
                <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">E-Mail</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="deine@email.de" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Nachricht *</label>
                <div className="relative">
                  <Textarea
                    ref={messageRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                    placeholder="Was ist passiert? Was hast du gemacht, bevor der Fehler aufgetreten ist?"
                    className="min-h-[120px] resize-none"
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                    {message.length}/500
                  </span>
                </div>
              </div>

              {submitError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <Button onClick={handleSubmit} disabled={!message.trim() || submitting} className="w-full h-11">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Wird gesendet...</>
                ) : (
                  'Ticket erstellen'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
