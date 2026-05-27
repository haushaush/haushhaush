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
      const { data: cache } = await supabase
        .from('meta_accounts_cache')
        .select('meta_account_id, name, business_name')
        .order('name', { ascending: true });
      let list = (cache || []) as MetaAccount[];
      if (list.length === 0) {
        const { data } = await supabase.functions.invoke('list-meta-accounts', { body: {} });
        list = (data as any)?.accounts || [];
      }
      setAccounts(list);
      await computeSuggestion(list);
    } catch (e: any) {
      toast.error('Konten laden fehlgeschlagen: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const computeSuggestion = async (list: MetaAccount[]) => {
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
        const acc = list.find((a) => a.meta_account_id === accId);
        const cand: Suggestion = {
          account_id: accId,
          account_name: acc?.name || accId,
          client_id: c.id,
          client_name: c.name,
          confidence: s,
        };
        if (!best || s > best.confidence) best = cand;
      }
    }
    setSuggestion(best);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        (a.name || '').toLowerCase().includes(q) ||
        a.meta_account_id.toLowerCase().includes(q) ||
        (a.business_name || '').toLowerCase().includes(q),
    );
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
