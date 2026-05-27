import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  List, RefreshCw, Plus, Trash2, Eye, ArrowLeft, Search, Loader2,
  ArrowUp, ArrowDown, ArrowUpDown, Pencil, Zap, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


import { renderCellPlain, renderCellNode, getCellPills, normalizeColumns, loadAliases, subscribeAliases, getColumnDisplay, type SlackColumn } from '@/utils/slack-list-renderer';
import { SlackAliasEditor } from './SlackAliasEditor';
import { SlackCellEditor } from './SlackCellEditor';
import { Settings2 } from 'lucide-react';

const EDITABLE_COLUMN_IDS = ['Col0B5AR5UJQJ'];
const EDITABLE_COLUMN_NAMES = ['kampagnen status', 'kampagnenstatus'];

const isColumnEditable = (col: SlackColumn) => {
  const name = (col.name || '').toLowerCase().trim();
  return EDITABLE_COLUMN_IDS.includes(col.id) ||
         EDITABLE_COLUMN_NAMES.includes(name);
};

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

function cellToString(v: unknown, col?: SlackColumn, listId?: string | null): string {
  return renderCellPlain(v, col, listId);
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
  
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [errorCell, setErrorCell] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [aliasEditorOpen, setAliasEditorOpen] = useState(false);
  const [aliasVersion, setAliasVersion] = useState(0);

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
  useEffect(() => {
    if (activeListId) {
      loadItems(activeListId);
      loadAliases(activeListId).then(() => setAliasVersion((v) => v + 1));
    }
  }, [activeListId]);
  useEffect(() => subscribeAliases(() => setAliasVersion((v) => v + 1)), []);

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

  const saveCell = async (itemId: string, col: SlackColumn, newValue: unknown) => {
    if (!activeListId) return;
    const cellKey = `${itemId}::${col.id}`;
    const item = items.find((i) => i.slack_item_id === itemId);
    const prev = item?.fields?.[col.id];

    // Optimistic store — shape mirrors what sync writes back
    const optimistic = (() => {
      const t = col.type;
      if (t === 'select') return { select: newValue ? [newValue as string] : [] };
      if (t === 'multi_select') return { select: Array.isArray(newValue) ? newValue : [] };
      if (t === 'checkbox') return { checkbox: !!newValue };
      if (t === 'date') return { date: newValue as number };
      if (t === 'number') return { value: newValue };
      return { text: String(newValue ?? '') };
    })();

    setSavingCell(cellKey);
    setItems((curr) =>
      curr.map((i) =>
        i.slack_item_id === itemId ? { ...i, fields: { ...i.fields, [col.id]: optimistic } } : i,
      ),
    );
    setEditing(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-slack-list-update', {
        body: {
          slack_item_id: itemId,
          slack_list_id: activeListId,
          field_updates: { [col.id]: newValue },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Aktualisiert');
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
      setItems((curr) =>
        curr.map((i) =>
          i.slack_item_id === itemId ? { ...i, fields: { ...i.fields, [col.id]: prev } } : i,
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
        columns.some((c) => cellToString(it.fields?.[c.id], c, activeListId).toLowerCase().includes(q)),
      );
    }
    if (sortCol) {
      const sortColDef = columns.find((c) => c.id === sortCol);
      r = [...r].sort((a, b) => {
        const av = cellToString(a.fields?.[sortCol], sortColDef, activeListId);
        const bv = cellToString(b.fields?.[sortCol], sortColDef, activeListId);
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [items, search, sortCol, sortDir, columns, activeListId, aliasVersion]);

  const toggleSort = (colId: string) => {
    if (sortCol === colId) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(colId); setSortDir('asc'); }
  };

  const renameOptionLabel = async (colId: string, optId: string, currentLabel: string) => {
    if (!activeList) return;
    const next = window.prompt(
      `Slack stellt das Label dieser Option nicht über die Bot-API bereit.\nVergib hier einen lesbaren Namen für "${optId}":`,
      currentLabel === optId ? '' : currentLabel,
    );
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) return;

    const cols: any[] = Array.isArray(activeList.columns) ? [...activeList.columns] : [];
    const idx = cols.findIndex((c) => c?.id === colId);
    if (idx === -1) return;
    const col = { ...cols[idx] };
    const opts = { ...(col.options || {}) };
    const choices: any[] = Array.isArray(opts.choices) ? [...opts.choices] : [];
    const cIdx = choices.findIndex((c) => c?.id === optId);
    if (cIdx === -1) choices.push({ id: optId, label: trimmed, color: 'gray' });
    else choices[cIdx] = { ...choices[cIdx], label: trimmed };
    opts.choices = choices;
    col.options = opts;
    cols[idx] = col;

    const { error } = await supabase
      .from('slack_lists')
      .update({ columns: cols })
      .eq('slack_list_id', activeList.slack_list_id);
    if (error) {
      toast.error('Umbenennen fehlgeschlagen: ' + error.message);
      return;
    }
    toast.success(`Option-Label gespeichert: ${trimmed}`);
    await loadLists();
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAliasEditorOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              Anzeige anpassen
            </Button>
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

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block w-1 h-1 rounded-full bg-primary" />
          Nur die Spalte „Kampagnen Status" kann hier editiert werden. Alle anderen Daten kommen aus Slack.
        </p>

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
                          {getColumnDisplay(col.id, activeListId, col.name || col.id)}
                          {isColumnEditable(col) && (
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          )}
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
                    {columns.map((col) => {
                      const cellKey = `${it.slack_item_id}::${col.id}`;
                      const editable = isColumnEditable(col);
                      const isEditing = editing?.itemId === it.slack_item_id && editing?.colId === col.id && editable;
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
                            <SlackCellEditor
                              field={val}
                              column={col as SlackColumn}
                              slackListId={activeListId}
                              onSave={async (newValue) => {
                                await saveCell(it.slack_item_id, col as SlackColumn, newValue);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <div
                              onClick={editable ? () => setEditing({ itemId: it.slack_item_id, colId: col.id }) : undefined}
                              className={cn(
                                'min-h-[28px] flex items-center gap-2 rounded px-1 -mx-1',
                                editable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
                              )}
                            >
                              {(() => {
                                if (col.type === 'checkbox' || typeof val === 'boolean') {
                                  return renderCellNode(val, col as SlackColumn);
                                }
                                const pills = getCellPills(val, col as SlackColumn, activeListId);
                                if (pills) {
                                  if (pills.length === 0) {
                                    return <span className="text-muted-foreground/50">↩</span>;
                                  }
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {pills.map((p) => (
                                        <button
                                          key={p.id}
                                          type="button"
                                          title={`Alt+Klick um Label umzubenennen (Slack-ID: ${p.id})`}
                                          onClick={(e) => {
                                            if (!e.altKey) return;
                                            e.stopPropagation();
                                            renameOptionLabel(col.id, p.id, p.label);
                                          }}
                                          className={cn(
                                            'inline-flex items-center rounded-full border px-3 h-6 text-xs font-medium transition-opacity hover:opacity-80',
                                            p.className,
                                          )}
                                        >
                                          {p.label}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                }
                                const plain = renderCellPlain(val, col as SlackColumn, activeListId);
                                if (!plain) {
                                  return <span className="text-muted-foreground/50">↩</span>;
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

        <SlackAliasEditor
          open={aliasEditorOpen}
          onOpenChange={setAliasEditorOpen}
          slackListId={activeList.slack_list_id}
          columns={columns}
          items={items}
          onSaved={() => setAliasVersion((v) => v + 1)}
        />
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
