import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowLeft, Check, X, AlertCircle, Info, Mail } from 'lucide-react';
import { PROVIDER_PRESETS, inferProviderFromEmail, errorCodeToMessage } from '@/lib/email/providers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AddAccountModalProps {
  open: boolean;
  onClose: () => void;
  onAccountSaved: () => void;
  prefill?: {
    id?: string;
    email_address: string;
    display_name?: string | null;
    provider?: string | null;
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    imap_user: string;
    smtp_host?: string | null;
    smtp_port?: number | null;
    smtp_secure?: boolean | null;
  } | null;
}

type Step = 1 | 2 | 3;

export function AddAccountModal({ open, onClose, onAccountSaved, prefill }: AddAccountModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [providerKey, setProviderKey] = useState<string>('custom');
  const [form, setForm] = useState({
    email_address: '',
    display_name: '',
    imap_host: '',
    imap_port: 993,
    imap_secure: true,
    imap_password: '',
    smtp_host: '',
    smtp_port: 465,
    smtp_secure: true,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; mailboxesCount: number; inboxCount: number }
    | { ok: false; code: string; message: string }
    | null
  >(null);
  const [saving, setSaving] = useState(false);

  // Initialize from prefill (repair flow)
  useEffect(() => {
    if (open && prefill) {
      setProviderKey(prefill.provider || 'custom');
      setForm({
        email_address: prefill.email_address,
        display_name: prefill.display_name ?? '',
        imap_host: prefill.imap_host,
        imap_port: prefill.imap_port,
        imap_secure: prefill.imap_secure,
        imap_password: '',
        smtp_host: prefill.smtp_host ?? '',
        smtp_port: prefill.smtp_port ?? 465,
        smtp_secure: prefill.smtp_secure ?? true,
      });
      setStep(2);
    } else if (open) {
      setStep(1);
      setProviderKey('custom');
      setForm({
        email_address: '',
        display_name: '',
        imap_host: '',
        imap_port: 993,
        imap_secure: true,
        imap_password: '',
        smtp_host: '',
        smtp_port: 465,
        smtp_secure: true,
      });
      setTestResult(null);
    }
  }, [open, prefill]);

  const handleProviderSelect = (key: string) => {
    setProviderKey(key);
    const preset = PROVIDER_PRESETS[key];
    setForm((f) => ({
      ...f,
      imap_host: preset.imap_host || f.imap_host,
      imap_port: preset.imap_port || f.imap_port,
      imap_secure: preset.imap_secure,
      smtp_host: preset.smtp_host || f.smtp_host,
      smtp_port: preset.smtp_port || f.smtp_port,
      smtp_secure: preset.smtp_secure,
    }));
    setStep(2);
  };

  const handleEmailBlur = () => {
    if (!form.email_address || providerKey !== 'custom') return;
    const inferred = inferProviderFromEmail(form.email_address);
    if (inferred) {
      handleProviderSelect(inferred);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setStep(3);
    try {
      const { data, error } = await supabase.functions.invoke('imap-test-connection', {
        body: {
          imapHost: form.imap_host,
          imapPort: Number(form.imap_port),
          imapSecure: form.imap_secure,
          imapUser: form.email_address, // most providers expect full email
          imapPassword: form.imap_password,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        setTestResult({
          ok: true,
          mailboxesCount: (data.mailboxes ?? []).length,
          inboxCount: data.inboxCount ?? 0,
        });
      } else {
        setTestResult({ ok: false, code: data?.error ?? 'unknown', message: data?.message ?? '' });
      }
    } catch (err) {
      setTestResult({ ok: false, code: 'unknown', message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('imap-save-account', {
        body: {
          id: prefill?.id,
          email_address: form.email_address,
          display_name: form.display_name || null,
          provider: providerKey === 'custom' ? null : providerKey,
          imap_host: form.imap_host,
          imap_port: Number(form.imap_port),
          imap_secure: form.imap_secure,
          imap_user: form.email_address,
          imap_password: form.imap_password,
          smtp_host: form.smtp_host || null,
          smtp_port: form.smtp_port ? Number(form.smtp_port) : null,
          smtp_secure: form.smtp_secure,
          last_test_status: 'ok',
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Speichern fehlgeschlagen');
      toast.success('E-Mail-Konto verbunden');
      onAccountSaved();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const preset = PROVIDER_PRESETS[providerKey];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {prefill?.id ? 'Konto reparieren' : 'E-Mail-Konto hinzufügen'}
          </DialogTitle>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center gap-2 px-1 mb-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                step >= s ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Wähle deinen E-Mail-Anbieter:</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(PROVIDER_PRESETS).map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleProviderSelect(p.key)}
                  className="flex flex-col items-center justify-center gap-2 p-4 border border-border rounded-lg hover:border-primary hover:bg-muted/50 transition-colors text-center min-h-[88px]"
                >
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium leading-tight">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Anbieter ändern
            </button>

            {preset.note && (
              <div className="flex gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80">{preset.note}</p>
              </div>
            )}

            {providerKey === 'gmail' && (
              <details className="text-xs border border-border rounded-lg">
                <summary className="cursor-pointer p-2 font-medium">📋 So erstellst du ein Gmail App-Passwort</summary>
                <ol className="list-decimal pl-5 p-3 space-y-1 text-muted-foreground">
                  <li>Gehe zu <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline text-primary">myaccount.google.com/apppasswords</a></li>
                  <li>App-Name: "Agency Hub Portal"</li>
                  <li>Generieren klicken</li>
                  <li>16-Zeichen-Passwort kopieren und unten einfügen</li>
                </ol>
              </details>
            )}

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">E-Mail-Adresse *</Label>
                  <Input
                    type="email"
                    value={form.email_address}
                    onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                    onBlur={handleEmailBlur}
                    placeholder="name@firma.de"
                    disabled={!!prefill?.id}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Anzeigename</Label>
                  <Input
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Max Mustermann"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">IMAP Passwort *</Label>
                <Input
                  type="password"
                  value={form.imap_password}
                  onChange={(e) => setForm({ ...form, imap_password: e.target.value })}
                  placeholder={prefill?.id ? 'Leer lassen, um aktuelles zu behalten' : '••••••••••••••••'}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">IMAP Server *</Label>
                  <Input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IMAP Port *</Label>
                  <Input type="number" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.imap_secure} onCheckedChange={(v) => setForm({ ...form, imap_secure: v })} />
                <Label className="text-xs cursor-pointer" onClick={() => setForm({ ...form, imap_secure: !form.imap_secure })}>SSL/TLS aktivieren</Label>
              </div>

              <div className="border-t border-border pt-3 grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">SMTP Server</Label>
                  <Input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SMTP Port</Label>
                  <Input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.smtp_secure} onCheckedChange={(v) => setForm({ ...form, smtp_secure: v })} />
                <Label className="text-xs cursor-pointer" onClick={() => setForm({ ...form, smtp_secure: !form.smtp_secure })}>SMTP SSL/TLS</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button
                onClick={runTest}
                disabled={!form.email_address || !form.imap_host || !form.imap_password}
              >
                Verbindung testen
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Zurück zu den Zugangsdaten
            </button>

            <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-2 text-sm font-mono">
              {testing && (
                <>
                  <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Teste IMAP-Verbindung…</div>
                </>
              )}
              {testResult?.ok === true && (
                <>
                  <div className="flex items-center gap-2 text-emerald-500"><Check className="h-4 w-4" /> SSL-Verbindung aufgebaut</div>
                  <div className="flex items-center gap-2 text-emerald-500"><Check className="h-4 w-4" /> Login erfolgreich</div>
                  <div className="flex items-center gap-2 text-emerald-500">
                    <Check className="h-4 w-4" /> {testResult.mailboxesCount} Postfächer gefunden
                  </div>
                  {testResult.inboxCount > 0 && (
                    <div className="flex items-center gap-2 text-emerald-500">
                      <Check className="h-4 w-4" /> {testResult.inboxCount} Nachrichten im Posteingang
                    </div>
                  )}
                </>
              )}
              {testResult?.ok === false && (
                <>
                  <div className="flex items-center gap-2 text-destructive"><X className="h-4 w-4" /> Verbindung fehlgeschlagen</div>
                  <div className="flex items-start gap-2 text-foreground/80 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p>{errorCodeToMessage(testResult.code, testResult.message)}</p>
                      {testResult.message && testResult.message !== errorCodeToMessage(testResult.code, testResult.message) && (
                        <p className="text-muted-foreground mt-1 break-all">{testResult.message}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {testResult?.ok === false && (
                <Button variant="outline" onClick={() => setStep(2)}>Daten korrigieren</Button>
              )}
              {testResult?.ok === true && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Konto hinzufügen
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
