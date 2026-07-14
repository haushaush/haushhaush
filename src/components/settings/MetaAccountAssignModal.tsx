import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Sparkles, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MetaAccount {
  meta_account_id: string;
  name: string | null;
  business_name?: string | null;
}

interface Suggestion {
  account_id: string;
  account_name: string;
  client_id: string;
  client_name: string;
  confidence: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slackItemId: string | null;
  slackListId: string | null;
  slackItemName: string | null;
  currentAssignment: any | null;
  onSaved: () => void;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(gmbh|ag|kg|ohg|mbh|se|ug)\.?$/i, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let tA = 0;
  let tB = 0;
  for (const v of A.values()) tA += v;
  for (const v of B.values()) tB += v;
  for (const [g, ca] of A) {
    const cb = B.get(g);
    if (cb) inter += Math.min(ca, cb);
  }
  return (2 * inter) / (tA + tB);
}

export function MetaAccountAssignModal({
  open, onOpenChange, slackItemId, slackListId, slackItemName, currentAssignment, onSaved,
}: Props) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(currentAssignment?.meta_account_id || null);
    setSearch('');
    void loadAccounts();
  }, [open, currentAssignment]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      // Load ALL accounts from cache with explicit high limit (avoid PostgREST 1000 default silently truncating)
      const { data: cache } = await supabase
        .from('meta_accounts_cache')
        .select('meta_account_id, name, business_name')
        .order('name', { ascending: true })
        .limit(10000);
      const byId = new Map<string, MetaAccount>();
      for (const a of (cache || []) as MetaAccount[]) byId.set(a.meta_account_id, a);

      // Always merge business owned + client accounts (matches MetaAccountSelector data source).
      // The cache may be built from /me/adaccounts (owned only) and miss client accounts.
      try {
        const { data: biz } = await supabase.functions.invoke('list-meta-ad-accounts', { body: {} });
        for (const a of ((biz as any)?.accounts || [])) {
          const id: string = a.id || a.meta_account_id || (a.account_id ? `act_${a.account_id}` : '');
          if (!id) continue;
          const prev = byId.get(id);
          byId.set(id, {
            meta_account_id: id,
            name: a.name ?? prev?.name ?? null,
            business_name: a.business_name ?? prev?.business_name ?? null,
          });
        }
      } catch (_e) {
        // fall back to cache only
      }

      // Fallback if still empty
      if (byId.size === 0) {
        const { data } = await supabase.functions.invoke('list-meta-accounts', { body: {} });
        for (const a of ((data as any)?.accounts || []) as MetaAccount[]) {
          byId.set(a.meta_account_id, a);
        }
      }

      const list = Array.from(byId.values()).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      setAccounts(list);
      await computeSuggestion(list, byId);
    } catch (e: any) {
      toast.error('Konten laden fehlgeschlagen: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const computeSuggestion = async (list: MetaAccount[], byId: Map<string, MetaAccount>) => {
    if (!slackItemName) { setSuggestion(null); return; }
    const target = normalize(slackItemName);
    if (!target) { setSuggestion(null); return; }
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, meta_account_id')
      .not('meta_account_id', 'is', null);
    let best: Suggestion | null = null;
    for (const c of clients || []) {
      const n = normalize(c.name || '');
      if (!n) continue;
      const s = n === target ? 1 : similarity(n, target);
      if (s >= 0.7) {
        const accId = (c.meta_account_id || '').startsWith('act_')
          ? c.meta_account_id
          : `act_${c.meta_account_id}`;
        const acc = byId.get(accId);
        const cand: Suggestion = {
          account_id: accId,
          account_name: acc?.name || c.name || accId,
          client_id: c.id,
          client_name: c.name,
          confidence: s,
        };
        if (!best || s > best.confidence) best = cand;
      }
    }
    setSuggestion(best);

    // Ensure the suggested account is ALWAYS present in the searchable list,
    // even if it is missing from the cache and business account fetch.
    if (best && !byId.has(best.account_id)) {
      const stub: MetaAccount = {
        meta_account_id: best.account_id,
        name: best.account_name,
        business_name: null,
      };
      byId.set(best.account_id, stub);
      const merged = Array.from(byId.values()).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      setAccounts(merged);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase().trim();
    const qNorm = normalize(q);
    const qId = q.replace(/^act_/, '');
    return accounts.filter((a) => {
      const name = (a.name || '').toLowerCase();
      const biz = (a.business_name || '').toLowerCase();
      const id = a.meta_account_id.toLowerCase();
      return (
        name.includes(q) ||
        biz.includes(q) ||
        id.includes(q) ||
        id.replace(/^act_/, '').includes(qId) ||
        (qNorm && normalize(name).includes(qNorm))
      );
    });
  }, [accounts, search]);

  const save = async (source: 'auto' | 'manual') => {
    if (!slackItemId || !slackListId || !selected) return;
    setSaving(true);
    try {
      const acc = accounts.find((a) => a.meta_account_id === selected);
      const payload: any = {
        slack_item_id: slackItemId,
        slack_list_id: slackListId,
        meta_account_id: selected,
        meta_account_name: acc?.name || null,
        source,
        matched_client_id: source === 'auto' ? suggestion?.client_id || null : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('slack_item_meta_account')
        .upsert(payload, { onConflict: 'slack_item_id' });
      if (error) throw error;
      toast.success('Account zugewiesen');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    if (!slackItemId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('slack_item_meta_account')
        .delete()
        .eq('slack_item_id', slackItemId);
      if (error) throw error;
      toast.success('Verknüpfung getrennt');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Trennen fehlgeschlagen: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    setSelected(suggestion.account_id);
    void save('auto');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Account zuweisen{slackItemName ? ` für „${slackItemName}"` : ''}
          </DialogTitle>
        </DialogHeader>

        {suggestion && suggestion.account_id !== currentAssignment?.meta_account_id && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Vorschlag aus Kunden ({Math.round(suggestion.confidence * 100)}% Match)
            </div>
            <div>
              <span className="font-medium">{suggestion.client_name}</span>
              {' → '}
              <span>{suggestion.account_name}</span>
              <span className="text-muted-foreground"> ({suggestion.account_id})</span>
            </div>
            <Button size="sm" onClick={acceptSuggestion} disabled={saving}>
              Übernehmen
            </Button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Account suchen..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-auto border border-border rounded-md">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Konten werden geladen…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Keine Accounts.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((a) => (
                <li
                  key={a.meta_account_id}
                  className={cn(
                    'px-3 py-2 cursor-pointer hover:bg-muted/40 flex items-center gap-2',
                    selected === a.meta_account_id && 'bg-primary/10',
                  )}
                  onClick={() => setSelected(a.meta_account_id)}
                >
                  <input
                    type="radio"
                    checked={selected === a.meta_account_id}
                    onChange={() => setSelected(a.meta_account_id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {a.name || a.meta_account_id}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{a.meta_account_id}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            {currentAssignment && (
              <Button variant="ghost" size="sm" onClick={unlink} disabled={saving} className="text-destructive">
                <Unlink className="h-3.5 w-3.5 mr-1.5" /> Trennen
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={() => save('manual')} disabled={!selected || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
