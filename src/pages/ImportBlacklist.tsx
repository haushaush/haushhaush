import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { SmartBackButton } from '@/components/ui/BackButton';
import {
  Plus, Wallet, Image as ImageIcon, Search as SearchIcon, ShieldOff, Trash2,
  Loader2, AlertCircle, User, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Scope = 'kunde' | 'meta_account' | 'meta_campaign' | 'meta_ad' | 'keyword';
type AddableScope = 'meta_account' | 'meta_ad' | 'keyword';

interface BlacklistEntry {
  id: string;
  scope: Scope;
  target_id: string;
  target_label: string | null;
  reason: string | null;
  created_at: string;
}

const SCOPE_CONFIG: Record<Scope, { label: string; icon: any; description: string }> = {
  kunde: { label: 'Kunden', icon: User, description: 'Diese Kunden werden beim Import nie vorgeschlagen' },
  meta_account: { label: 'Werbekonten', icon: Wallet, description: 'Aus diesen Werbekonten werden keine Anzeigen gezogen' },
  meta_campaign: { label: 'Kampagnen', icon: Target, description: 'Spezifische Kampagnen ausgeschlossen' },
  meta_ad: { label: 'Anzeigen', icon: ImageIcon, description: 'Einzelne Anzeigen gesperrt' },
  keyword: { label: 'Keywords', icon: SearchIcon, description: 'Anzeigen mit diesen Wörtern im Namen werden gefiltert' },
};

interface MetaAccount {
  id: string;
  account_id: string;
  name: string;
  status: 'active' | 'inactive';
  currency?: string;
  is_client_account?: boolean;
}

function useMetaAdAccounts(enabled: boolean) {
  return useQuery<MetaAccount[]>({
    queryKey: ['meta-ad-accounts', 'all-available'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-meta-ad-accounts');
      if (error) throw error;
      return (data as any)?.accounts ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export default function ImportBlacklist() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);

  const { data: entries = [], refetch } = useQuery<BlacklistEntry[]>({
    queryKey: ['import-blacklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_blacklist' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any) as BlacklistEntry[];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<Scope, BlacklistEntry[]> = {
      kunde: [], meta_account: [], meta_campaign: [], meta_ad: [], keyword: [],
    };
    for (const e of entries) g[e.scope]?.push(e);
    return g;
  }, [entries]);

  const remove = async (id: string) => {
    const { error } = await supabase.from('import_blacklist' as any).delete().eq('id', id);
    if (error) toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Entfernt' }); refetch(); }
  };

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <SmartBackButton className="mb-4" />
      <PageHeader
        title="Import-Blacklist"
        description="Werbekonten, Anzeigen und Keywords, die beim Bulk-Import niemals importiert werden."
        size="lg"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Eintrag hinzufügen
          </Button>
        }
      />

      <div className="space-y-6 mt-8">
        {(Object.keys(SCOPE_CONFIG) as Scope[]).map(scope => {
          const items = grouped[scope] ?? [];
          if (items.length === 0) return null;
          const cfg = SCOPE_CONFIG[scope];
          const Icon = cfg.icon;
          return (
            <div key={scope} className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {cfg.label} · <span className="tabular-nums text-gray-500">{items.length}</span>
                  </h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{cfg.description}</p>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map(entry => (
                  <li key={entry.id} className="flex items-center justify-between p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {entry.target_label || entry.target_id}
                      </div>
                      {entry.reason && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 italic truncate">"{entry.reason}"</div>
                      )}
                    </div>
                    <button
                      onClick={() => remove(entry.id)}
                      className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline ml-3 shrink-0 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {entries.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
            <ShieldOff className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Blacklist ist leer.</p>
          </div>
        )}
      </div>

      <AddBlacklistDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={refetch}
        existingAccountIds={new Set(grouped.meta_account.map(e => e.target_id))}
      />
    </div>
  );
}

function AddBlacklistDialog({
  open, onClose, onAdded, existingAccountIds,
}: {
  open: boolean; onClose: () => void; onAdded: () => void; existingAccountIds: Set<string>;
}) {
  const { toast } = useToast();
  const [scope, setScope] = useState<AddableScope>('meta_account');
  const [targetId, setTargetId] = useState('');
  const [targetLabel, setTargetLabel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: accounts = [], isLoading: accountsLoading, error: accountsError } =
    useMetaAdAccounts(open && scope === 'meta_account');

  const availableAccounts = useMemo(
    () => accounts.filter(a => !existingAccountIds.has(a.account_id) && !existingAccountIds.has(a.id)),
    [accounts, existingAccountIds],
  );

  const reset = () => { setTargetId(''); setTargetLabel(''); setReason(''); };

  const handleAdd = async () => {
    if (!targetId.trim()) {
      toast({ title: 'Bitte Wert wählen', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('import_blacklist' as any).insert({
        scope,
        target_id: targetId.trim(),
        target_label: (targetLabel || targetId).trim(),
        reason: reason.trim() || null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Hinzugefügt' });
      reset();
      onAdded();
      onClose();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e?.message ?? 'Unbekannt', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && (reset(), onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Zur Blacklist hinzufügen</DialogTitle>
          <DialogDescription>
            Ausgeschlossene Werbekonten, Anzeigen oder Keywords werden beim Import nie berücksichtigt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
              Typ
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['meta_account', 'meta_ad', 'keyword'] as AddableScope[]).map(s => (
                <button
                  key={s}
                  onClick={() => { setScope(s); reset(); }}
                  className={cn(
                    'px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    scope === s
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300',
                  )}
                >
                  {s === 'meta_account' ? 'Werbekonto' : s === 'meta_ad' ? 'Anzeige' : 'Keyword'}
                </button>
              ))}
            </div>
          </div>

          {scope === 'meta_account' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                Werbekonto auswählen
              </label>
              {accountsLoading ? (
                <div className="flex items-center gap-2 py-6 justify-center text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Lade Werbekonten aus Meta…
                </div>
              ) : accountsError ? (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>{(accountsError as any)?.message ?? 'Konnte Werbekonten nicht laden.'}</div>
                </div>
              ) : availableAccounts.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  Alle verfügbaren Werbekonten sind bereits auf der Blacklist.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {availableAccounts.map(acc => {
                    const checked = targetId === acc.account_id;
                    return (
                      <label
                        key={acc.id}
                        className={cn(
                          'flex items-start gap-3 p-3 cursor-pointer transition-colors',
                          checked ? 'bg-gray-50 dark:bg-gray-900' : 'hover:bg-gray-50 dark:hover:bg-gray-900/50',
                        )}
                      >
                        <input
                          type="radio"
                          name="meta-account"
                          checked={checked}
                          onChange={() => { setTargetId(acc.account_id); setTargetLabel(acc.name); }}
                          className="mt-1 accent-gray-900 dark:accent-white"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {acc.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                            <span className="font-mono tabular-nums">{acc.account_id}</span>
                            {acc.is_client_account && (
                              <>
                                <span>·</span>
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-semibold">Client</span>
                              </>
                            )}
                            {acc.status === 'inactive' && (
                              <>
                                <span>·</span>
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold">Inaktiv</span>
                              </>
                            )}
                            {acc.currency && (
                              <>
                                <span>·</span>
                                <span>{acc.currency}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {!accountsLoading && !accountsError && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {accounts.length} Werbekonten gefunden · {existingAccountIds.size} bereits geblacklistet
                </p>
              )}
            </div>
          )}

          {scope === 'meta_ad' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                Meta-Anzeigen-ID
              </label>
              <input
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setTargetLabel(e.target.value); }}
                placeholder="z.B. 23859048329450123"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-mono focus:border-gray-400 outline-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Tipp: Einzelne Anzeigen kannst du auch direkt aus der Detail-Page blacklisten.
              </p>
            </div>
          )}

          {scope === 'keyword' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                Keyword
              </label>
              <input
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setTargetLabel(e.target.value); }}
                placeholder='z.B. "Test" — sperrt alle Anzeigen mit "Test" im Namen'
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:border-gray-400 outline-none"
              />
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-2">
                <AlertCircle className="w-3 h-3" />
                Vorsicht bei kurzen Keywords — kann zu viele Anzeigen ausschließen.
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
              Grund (optional)
            </label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="z.B. Kunde hat gekündigt"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:border-gray-400 outline-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={handleAdd} disabled={busy || !targetId.trim()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Zur Blacklist hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
