import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2, Pencil, Loader2, Check, ArrowRight, ArrowLeft, Link as LinkIcon } from 'lucide-react';

interface PipedriveAccount {
  id: string;
  name: string;
  domain: string;
  linked_kunde_id: string | null;
  pipedrive_user_name: string | null;
  pipedrive_user_email: string | null;
  pipedrive_company_name: string | null;
  total_deals_synced: number | null;
  total_persons_synced: number | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  color_hex: string | null;
  is_active: boolean;
}

interface CloseDealOpt {
  id: string;
  client_name: string;
  art: string | null;
}

interface AccountsModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const COLORS = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EAB308'];

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tagen`;
}

export function PipedriveAccountsModal({ open, onClose, onChanged }: AccountsModalProps) {
  const [accounts, setAccounts] = useState<PipedriveAccount[]>([]);
  const [closeDeals, setCloseDeals] = useState<CloseDealOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PipedriveAccount | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [accRes, dealRes] = await Promise.all([
      supabase.from('pipedrive_accounts' as any).select('*').order('created_at', { ascending: true }),
      supabase.from('close_deals').select('id, client_name, art').order('client_name'),
    ]);
    setAccounts(((accRes.data ?? []) as any) as PipedriveAccount[]);
    setCloseDeals(((dealRes.data ?? []) as any) as CloseDealOpt[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  const dealById = useMemo(() => {
    const m = new Map<string, CloseDealOpt>();
    closeDeals.forEach(d => m.set(d.id, d));
    return m;
  }, [closeDeals]);

  const handleSync = async (account: PipedriveAccount) => {
    setSyncingId(account.id);
    const toastId = toast.loading(`Synchronisiere ${account.name}…`);
    const { data, error } = await supabase.functions.invoke('pipedrive-sync-account', {
      body: { accountId: account.id },
    });
    toast.dismiss(toastId);
    setSyncingId(null);
    if (error || !(data as any)?.ok) {
      toast.error(`Sync fehlgeschlagen: ${(data as any)?.message || error?.message || 'Unbekannter Fehler'}`);
    } else {
      const s = (data as any).summary;
      toast.success(`✓ ${account.name}: ${s.deals} Deals · ${s.persons} Personen · ${s.pipelines} Pipelines`);
    }
    fetchData();
    onChanged?.();
  };

  const handleDelete = async (account: PipedriveAccount) => {
    if (!confirm(`Pipedrive-Konto "${account.name}" wirklich trennen?\n\nAlle synchronisierten Deals, Personen und Pipelines werden ebenfalls gelöscht.`)) return;
    setDeletingId(account.id);
    const { data, error } = await supabase.functions.invoke('pipedrive-delete-account', {
      body: { accountId: account.id },
    });
    setDeletingId(null);
    if (error || !(data as any)?.ok) {
      toast.error(`Trennen fehlgeschlagen: ${(data as any)?.message || error?.message}`);
    } else {
      toast.success(`${account.name} getrennt`);
      fetchData();
      onChanged?.();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Pipedrive Konten</span>
              <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Hinzufügen
              </Button>
            </DialogTitle>
            <DialogDescription>
              Verbinde mehrere Pipedrive-Workspaces — einen pro Kunde oder einen zentralen Account.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">Noch keine Pipedrive-Konten verbunden.</p>
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Erstes Konto hinzufügen
              </Button>
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              {accounts.map(acc => {
                const linked = acc.linked_kunde_id ? dealById.get(acc.linked_kunde_id) : null;
                return (
                  <div key={acc.id} className="rounded-lg border border-border p-4 bg-card">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1.5 h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color_hex || '#0EA5E9' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold truncate">{acc.name}</h4>
                          {acc.last_sync_status === 'error' && (
                            <Badge variant="destructive" className="text-[10px]">Sync-Fehler</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                          {acc.domain}.pipedrive.com
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" />
                          Verknüpft mit:{' '}
                          {linked ? (
                            <span className="text-foreground font-medium">
                              {linked.client_name}{linked.art ? ` · ${linked.art}` : ''}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                          {acc.total_deals_synced ?? 0} Deals · {acc.total_persons_synced ?? 0} Personen · zuletzt {timeAgo(acc.last_sync_at)}
                        </p>
                        {acc.last_sync_status === 'error' && acc.last_sync_message && (
                          <p className="text-[11px] text-destructive mt-1 truncate" title={acc.last_sync_message}>
                            {acc.last_sync_message}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => { setEditing(acc); setFormOpen(true); }}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => handleSync(acc)}
                          disabled={syncingId === acc.id}
                          title="Sync jetzt"
                        >
                          {syncingId === acc.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(acc)}
                          disabled={deletingId === acc.id}
                          title="Trennen"
                        >
                          {deletingId === acc.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PipedriveAccountForm
        open={formOpen}
        editing={editing}
        closeDeals={closeDeals}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); fetchData(); onChanged?.(); }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account form (3-step) — credentials → test → linking + color
// ─────────────────────────────────────────────────────────────────────────────

interface FormProps {
  open: boolean;
  editing: PipedriveAccount | null;
  closeDeals: CloseDealOpt[];
  onClose: () => void;
  onSaved: () => void;
}

function fuzzyScore(a: string, b: string): number {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.includes(y) || y.includes(x)) return 80;
  const tokensX = x.split(/\s+/).filter(Boolean);
  const tokensY = y.split(/\s+/).filter(Boolean);
  const overlap = tokensX.filter(t => tokensY.some(u => u.includes(t) || t.includes(u))).length;
  if (overlap > 0) return 40 + overlap * 10;
  return 0;
}

function PipedriveAccountForm({ open, editing, closeDeals, onClose, onSaved }: FormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [linkedKundeId, setLinkedKundeId] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; user?: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStep(3);
      setName(editing.name);
      setDomain(editing.domain);
      setApiToken('');
      setLinkedKundeId(editing.linked_kunde_id);
      setColor(editing.color_hex || COLORS[0]);
      setTestResult({
        ok: true,
        message: `Bestehender Account · ${editing.pipedrive_user_email ?? ''}`,
        user: { name: editing.pipedrive_user_name, company_name: editing.pipedrive_company_name },
      });
    } else {
      setStep(1);
      setName('');
      setDomain('');
      setApiToken('');
      setLinkedKundeId(null);
      setColor(COLORS[0]);
      setTestResult(null);
    }
    setSearch('');
  }, [open, editing]);

  const sortedDeals = useMemo(() => {
    if (!closeDeals.length) return [];
    const q = search.trim() || name;
    if (!q) return closeDeals;
    return [...closeDeals].sort((a, b) => fuzzyScore(b.client_name, q) - fuzzyScore(a.client_name, q));
  }, [closeDeals, search, name]);

  const handleTest = async () => {
    if (!domain || !apiToken) {
      toast.error('Domain und API-Token erforderlich');
      return;
    }
    setBusy(true);
    setTestResult(null);
    const { data, error } = await supabase.functions.invoke('pipedrive-test-connection', {
      body: { apiToken, domain },
    });
    setBusy(false);
    if (error || !(data as any)?.ok) {
      const msg = (data as any)?.message || error?.message || 'Unbekannter Fehler';
      setTestResult({ ok: false, message: msg });
      return;
    }
    const u = (data as any).user;
    setTestResult({
      ok: true,
      message: `Verbunden mit ${u.company_name ?? '—'} (${u.name} · ${u.email})`,
      user: u,
    });
    // Auto-suggest a name if empty
    if (!name && u.company_name) setName(u.company_name);
    setStep(3);
  };

  const handleSave = async () => {
    if (!name) { toast.error('Name erforderlich'); return; }
    setBusy(true);
    const body: any = { name, color, linkedKundeId };
    if (editing) {
      body.id = editing.id;
      if (apiToken) body.apiToken = apiToken;
      if (domain) body.domain = domain;
    } else {
      body.domain = domain;
      body.apiToken = apiToken;
    }
    const { data, error } = await supabase.functions.invoke('pipedrive-save-account', { body });
    setBusy(false);
    if (error || !(data as any)?.ok) {
      toast.error(`Speichern fehlgeschlagen: ${(data as any)?.message || error?.message}`);
      return;
    }
    toast.success(editing ? 'Konto aktualisiert' : 'Konto verbunden');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Bearbeiten: ${editing.name}` : 'Pipedrive-Konto hinzufügen'}
          </DialogTitle>
          <DialogDescription>
            Schritt {step} von 3 · {step === 1 ? 'Verbindung' : step === 2 ? 'Test' : 'Verknüpfung'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="pd-name" className="text-xs">Account-Name *</Label>
              <Input id="pd-name" value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Marvin Rixen Pipedrive" />
            </div>
            <div>
              <Label htmlFor="pd-domain" className="text-xs">Pipedrive-Domain *</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="pd-domain"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="marvin-rixen"
                />
                <span className="text-xs text-muted-foreground">.pipedrive.com</span>
              </div>
            </div>
            <div>
              <Label htmlFor="pd-token" className="text-xs">API-Token *</Label>
              <Input id="pd-token" type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="••••••••" />
              <p className="text-[11px] text-muted-foreground mt-1">
                📍 Pipedrive → Persönliche Einstellungen → API
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
              <Button onClick={() => { setStep(2); handleTest(); }} disabled={!name || !domain || !apiToken}>
                Weiter <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-4 text-center">
            {busy && <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />}
            {!busy && testResult && (
              testResult.ok ? (
                <>
                  <Check className="h-10 w-10 text-success mx-auto" />
                  <p className="text-sm font-medium">✅ {testResult.message}</p>
                  <Button onClick={() => setStep(3)}>Weiter zur Verknüpfung</Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-destructive">❌ {testResult.message}</p>
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
                  </Button>
                </>
              )
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Mit welchem Kunden verknüpfen?</Label>
              <Input
                placeholder="Suchen…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="mt-1 mb-2"
              />
              <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
                <button
                  type="button"
                  onClick={() => setLinkedKundeId(null)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 ${linkedKundeId === null ? 'bg-primary/10 font-medium' : ''}`}
                >
                  — Keine Verknüpfung (eigenständig)
                </button>
                {sortedDeals.slice(0, 30).map(d => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setLinkedKundeId(d.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 ${linkedKundeId === d.id ? 'bg-primary/10 font-medium' : ''}`}
                  >
                    {d.client_name}{d.art ? <span className="text-muted-foreground"> · {d.art}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Farbe</Label>
              <div className="flex gap-2 mt-1.5">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            {editing && (
              <div className="text-[11px] text-muted-foreground border-t pt-3">
                Lasse das API-Token-Feld leer, wenn du nur Name, Verknüpfung oder Farbe ändern willst.
                <Input
                  type="password"
                  className="mt-2"
                  placeholder="Neues API-Token (optional)"
                  value={apiToken}
                  onChange={e => setApiToken(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => editing ? onClose() : setStep(1)}>
                {editing ? 'Abbrechen' : <><ArrowLeft className="h-4 w-4 mr-1" /> Zurück</>}
              </Button>
              <Button onClick={handleSave} disabled={busy || !name}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Speichern
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
