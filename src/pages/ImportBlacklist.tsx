import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, User, Wallet, Target, Image as ImageIcon, Search as SearchIcon, ShieldOff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Scope = 'kunde' | 'meta_account' | 'meta_campaign' | 'meta_ad' | 'keyword';

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
      <PageHeader
        title="Import-Blacklist"
        description="Kunden, Werbekonten und Keywords, die beim Bulk-Import niemals importiert werden."
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

      <AddBlacklistDialog open={showAdd} onClose={() => setShowAdd(false)} onAdded={refetch} />
    </div>
  );
}

function AddBlacklistDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [scope, setScope] = useState<Scope>('kunde');
  const [targetId, setTargetId] = useState('');
  const [targetLabel, setTargetLabel] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: kunden = [] } = useQuery({
    queryKey: ['blacklist-kunden'],
    queryFn: async () => {
      const { data } = await supabase.from('close_deals')
        .select('id, client_name')
        .order('client_name')
        .limit(500);
      return (data ?? []).filter((k: any) => k.client_name);
    },
    enabled: open && scope === 'kunde',
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['blacklist-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('referenz_meta_ads' as any)
        .select('meta_account_id, meta_account_name')
        .not('meta_account_id', 'is', null);
      const map = new Map<string, string>();
      for (const r of ((data ?? []) as any[])) {
        if (r.meta_account_id && !map.has(r.meta_account_id)) {
          map.set(r.meta_account_id, r.meta_account_name || r.meta_account_id);
        }
      }
      return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: open && scope === 'meta_account',
  });

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
      setTargetId(''); setTargetLabel(''); setReason('');
      onAdded();
      onClose();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e?.message ?? 'Unbekannt', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Zur Blacklist hinzufügen</DialogTitle></DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">Typ</label>
            <div className="grid grid-cols-3 gap-2">
              {(['kunde', 'meta_account', 'keyword'] as Scope[]).map(s => (
                <button
                  key={s}
                  onClick={() => { setScope(s); setTargetId(''); setTargetLabel(''); }}
                  className={cn(
                    'px-3 py-2 rounded-xl border text-sm font-semibold transition-all',
                    scope === s
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300'
                  )}
                >
                  {s === 'kunde' ? 'Kunde' : s === 'meta_account' ? 'Werbekonto' : 'Keyword'}
                </button>
              ))}
            </div>
          </div>

          {scope === 'kunde' && (
            <select
              value={targetId}
              onChange={e => {
                const k = (kunden as any[]).find(x => x.id === e.target.value);
                setTargetId(e.target.value);
                setTargetLabel(k?.client_name ?? '');
              }}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm"
            >
              <option value="">Kunde auswählen...</option>
              {(kunden as any[]).map(k => (
                <option key={k.id} value={k.id}>{k.client_name}</option>
              ))}
            </select>
          )}

          {scope === 'meta_account' && (
            <select
              value={targetId}
              onChange={e => {
                const a = (accounts as any[]).find(x => x.id === e.target.value);
                setTargetId(e.target.value);
                setTargetLabel(a?.name ?? e.target.value);
              }}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm"
            >
              <option value="">Werbekonto auswählen...</option>
              {(accounts as any[]).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {scope === 'keyword' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">Keyword</label>
              <input
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setTargetLabel(e.target.value); }}
                placeholder='z.B. "Test" — sperrt alle Anzeigen mit "Test" im Namen'
                className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:border-gray-400 outline-none"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">Grund (optional)</label>
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
          <Button onClick={handleAdd} disabled={busy || !targetId.trim()}>Hinzufügen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
