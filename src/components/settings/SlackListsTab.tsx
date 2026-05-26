import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  List, RefreshCw, Plus, Trash2, Eye, ArrowLeft, Search, Loader2,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { renderCellPlain, renderCellNode, getCellPillClass, normalizeColumns, type SlackColumn } from '@/utils/slack-list-renderer';

interface SlackList {
  id: string;
  slack_list_id: string;
  list_name: string | null;
  columns: any;
  last_synced_at: string | null;
  created_at: string;
  item_count?: number;
}

interface SlackListItem {
  id: string;
  slack_item_id: string;
  slack_list_id: string;
  fields: Record<string, unknown>;
  date_created: number | null;
  synced_at: string;
}

function cellToString(v: unknown): string {
  return renderCellPlain(v);
}

export function SlackListsTab() {
  const [lists, setLists] = useState<SlackList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [newListId, setNewListId] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [items, setItems] = useState<SlackListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ itemId: string; colId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [errorCell, setErrorCell] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const activeList = lists.find((l) => l.slack_list_id === activeListId) || null;
  const columns = useMemo<SlackColumn[]>(() => {
    const fromMeta = normalizeColumns(activeList?.columns);
    if (fromMeta.length > 0) return fromMeta;
    // Fallback: derive from first item keys
    const first = items[0];
    if (!first?.fields) return [];
    return Object.keys(first.fields).map((id) => ({ id, name: id }));
  }, [activeList, items]);

  const loadLists = async () => {
    setLoadingLists(true);
    const { data, error } = await supabase
      .from('slack_lists')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Lists laden fehlgeschlagen: ' + error.message);
      setLoadingLists(false);
      return;
    }
    // count items per list
    const ids = (data || []).map((l: any) => l.slack_list_id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: cnts } = await supabase
        .from('slack_list_items')
        .select('slack_list_id')
        .in('slack_list_id', ids);
      for (const r of cnts || []) {
        counts[(r as any).slack_list_id] = (counts[(r as any).slack_list_id] || 0) + 1;
      }
    }
    setLists((data || []).map((l: any) => ({ ...l, item_count: counts[l.slack_list_id] || 0 })));
    setLoadingLists(false);
  };

  const loadItems = async (listId: string) => {
    setLoadingItems(true);
    const { data, error } = await supabase
      .from('slack_list_items')
      .select('*')
      .eq('slack_list_id', listId)
      .order('date_created', { ascending: false });
    if (error) {
      toast.error('Items laden fehlgeschlagen');
    }
    setItems((data as any[]) || []);
    setLoadingItems(false);
  };

  useEffect(() => { loadLists(); }, []);
  useEffect(() => { if (activeListId) loadItems(activeListId); }, [activeListId]);

  const addList = async () => {
    const id = newListId.trim();
    if (!id) return;
    setAdding(true);
    try {
      // Insert stub row + sync immediately
      const { error: upErr } = await supabase
        .from('slack_lists')
        .upsert({ slack_list_id: id }, { onConflict: 'slack_list_id' });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke('sync-slack-list', {
        body: { list_id: id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${(data as any).items_synced} Items synchronisiert`);
      setNewListId('');
      await loadLists();
    } catch (e: any) {
      toast.error('Fehler: ' + (e.message || 'Unbekannt'));
      // Cleanup stub if sync failed
      await supabase.from('slack_lists').delete().eq('slack_list_id', id).is('last_synced_at', null);
      await loadLists();
    } finally {
      setAdding(false);
    }
  };

  const syncList = async (listId: string) => {
    setSyncingId(listId);
    try {
      const { data, error } = await supabase.functions.invoke('sync-slack-list', {
        body: { list_id: listId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${(data as any).items_synced} Items synchronisiert`);
      await loadLists();
      if (activeListId === listId) await loadItems(listId);
    } catch (e: any) {
      toast.error('Sync fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    } finally {
      setSyncingId(null);
    }
  };

  const removeList = async (listId: string) => {
    if (!confirm('Liste wirklich trennen? Alle synchronisierten Items werden gelöscht.')) return;
    const { error } = await supabase.from('slack_lists').delete().eq('slack_list_id', listId);
    if (error) return toast.error(error.message);
    toast.success('Liste getrennt');
    if (activeListId === listId) setActiveListId(null);
    await loadLists();
  };

  const startEdit = (itemId: string, colId: string, current: unknown) => {
    setEditing({ itemId, colId });
    setEditValue(cellToString(current));
    setErrorCell(null);
  };

  const saveEdit = async () => {
    if (!editing || !activeListId) return;
    const { itemId, colId } = editing;
    const cellKey = `${itemId}::${colId}`;
    const item = items.find((i) => i.slack_item_id === itemId);
    const prev = item?.fields?.[colId];
    const newVal = editValue;
    if (cellToString(prev) === newVal) {
      setEditing(null);
      return;
    }
    setSavingCell(cellKey);
    // Optimistic
    setItems((curr) =>
      curr.map((i) =>
        i.slack_item_id === itemId
          ? { ...i, fields: { ...i.fields, [colId]: newVal } }
          : i,
      ),
    );
    setEditing(null);
    try {
      const { data, error } = await supabase.functions.invoke('update-slack-list-item', {
        body: {
          slack_item_id: itemId,
          slack_list_id: activeListId,
          field_updates: { [colId]: newVal },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Aktualisiert');
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
      // Revert
      setItems((curr) =>
        curr.map((i) =>
          i.slack_item_id === itemId
            ? { ...i, fields: { ...i.fields, [colId]: prev } }
            : i,
        ),
      );
      setErrorCell(cellKey);
      setTimeout(() => setErrorCell(null), 2000);
    } finally {
      setSavingCell(null);
    }
  };

  const filteredItems = useMemo(() => {
    let r = items;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((it) =>
        Object.values(it.fields || {}).some((v) => cellToString(v).toLowerCase().includes(q)),
      );
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = cellToString(a.fields?.[sortCol]);
        const bv = cellToString(b.fields?.[sortCol]);
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [items, search, sortCol, sortDir]);

  const toggleSort = (colId: string) => {
    if (sortCol === colId) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(colId); setSortDir('asc'); }
  };

  // ====== Detail View ======
  if (activeList) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveListId(null)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
            </Button>
            <div>
              <h3 className="text-lg font-heading font-semibold">
                {activeList.list_name || activeList.slack_list_id}
              </h3>
              <p className="text-xs text-muted-foreground">
                {activeList.last_synced_at
                  ? `Zuletzt synct: ${new Date(activeList.last_synced_at).toLocaleString('de-DE')}`
                  : 'Noch nicht synct'}
                {' · '}{filteredItems.length} / {items.length} Items
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncList(activeList.slack_list_id)}
            disabled={syncingId === activeList.slack_list_id}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5 mr-1.5', syncingId === activeList.slack_list_id && 'animate-spin')}
            />
            Aus Slack syncen
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="In allen Zellen suchen..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Card className="border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-500/10 text-xs uppercase tracking-wider text-purple-200/80">
                <tr>
                  {columns.map((col) => {
                    const active = sortCol === col.id;
                    return (
                      <th
                        key={col.id}
                        onClick={() => toggleSort(col.id)}
                        className="px-4 py-3 text-left cursor-pointer hover:text-primary select-none font-medium"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {col.name}
                          {active ? (
                            sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loadingItems &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      <td colSpan={Math.max(columns.length, 1)} className="px-3 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
                {!loadingItems && filteredItems.length === 0 && (
                  <tr className="border-t border-border">
                    <td colSpan={Math.max(columns.length, 1)} className="px-3 py-8 text-center text-muted-foreground">
                      Keine Items.
                    </td>
                  </tr>
                )}
                {!loadingItems && filteredItems.map((it) => (
                  <tr key={it.slack_item_id} className="border-t border-border hover:bg-muted/20">
                    {columns.length === 0 && (
                      <td className="px-3 py-2 font-mono text-xs">
                        {JSON.stringify(it.fields)}
                      </td>
                    )}
                    {columns.map((col) => {
                      const cellKey = `${it.slack_item_id}::${col.id}`;
                      const isEditing = editing?.itemId === it.slack_item_id && editing?.colId === col.id;
                      const isSaving = savingCell === cellKey;
                      const isError = errorCell === cellKey;
                      const val = it.fields?.[col.id];
                      return (
                        <td
                          key={col.id}
                          className={cn(
                            'px-3 py-2 align-top transition-colors',
                            isError && 'bg-destructive/20',
                          )}
                        >
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              className="h-7 text-sm"
                            />
                          ) : (
                            <div
                              onClick={() => startEdit(it.slack_item_id, col.id, val)}
                              className="cursor-text min-h-[28px] flex items-center gap-2 hover:bg-accent/50 rounded px-1 -mx-1"
                            >
                              {(() => {
                                const plain = renderCellPlain(val);
                                if (col.type === 'checkbox' || typeof val === 'boolean') {
                                  return renderCellNode(val, col as SlackColumn);
                                }
                                if (!plain) {
                                  return <span className="text-muted-foreground/50">↩</span>;
                                }
                                const pillClass = col.type === 'select'
                                  ? getCellPillClass(plain, (col as SlackColumn).options)
                                  : null;
                                if (pillClass) {
                                  return (
                                    <span className={cn('inline-flex items-center rounded-full border px-3 h-6 text-xs font-medium', pillClass)}>
                                      {plain}
                                    </span>
                                  );
                                }
                                return <span className="truncate max-w-[320px] whitespace-pre-wrap">{plain}</span>;
                              })()}
                              {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ====== List Overview ======
  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <List className="h-4 w-4 text-primary" />
            Slack-Listen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Slack-List-ID eingeben (z.B. F12345678)"
              value={newListId}
              onChange={(e) => setNewListId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addList()}
            />
            <Button onClick={addList} disabled={adding || !newListId.trim()}>
              {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Hinzufügen
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">List-Name</th>
                  <th className="px-3 py-2 text-left">List-ID</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-left">Last Synced</th>
                  <th className="px-3 py-2 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {loadingLists && (
                  <tr className="border-t border-border">
                    <td colSpan={5} className="px-3 py-4"><Skeleton className="h-4 w-full" /></td>
                  </tr>
                )}
                {!loadingLists && lists.length === 0 && (
                  <tr className="border-t border-border">
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      Noch keine Listen registriert.
                    </td>
                  </tr>
                )}
                {!loadingLists && lists.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">
                      {l.list_name || <span className="text-muted-foreground italic">unbenannt</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.slack_list_id}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Badge variant="outline">{l.item_count ?? 0}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {l.last_synced_at ? new Date(l.last_synced_at).toLocaleString('de-DE') : '–'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => syncList(l.slack_list_id)}
                          disabled={syncingId === l.slack_list_id}
                        >
                          <RefreshCw className={cn('h-3.5 w-3.5', syncingId === l.slack_list_id && 'animate-spin')} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveListId(l.slack_list_id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeList(l.slack_list_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
