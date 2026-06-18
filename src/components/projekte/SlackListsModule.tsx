import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  List, RefreshCw, Plus, Trash2, Search, Loader2, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  renderCellPlain, renderCellNode, getCellPills, normalizeColumns,
  loadAliases, subscribeAliases, getColumnDisplay, type SlackColumn,
} from '@/utils/slack-list-renderer';
import { SlackCellEditor } from '@/components/settings/SlackCellEditor';
import { SlackAliasEditor } from '@/components/settings/SlackAliasEditor';
import { Checkbox } from '@/components/ui/checkbox';

const getCheckboxValue = (cell: any): boolean => {
  const raw =
    Array.isArray(cell?.checkbox) ? cell.checkbox[0] :
    cell?.checkbox !== undefined ? cell.checkbox :
    Array.isArray(cell) ? cell[0] :
    cell;
  return raw === true || raw === 'true' || raw === 1;
};

type MappingRow = { colId: string; varName: string };

const EDITABLE_COLUMN_IDS = ['Col0B645A1WL8'];
const EDITABLE_COLUMN_NAMES = ['status'];
const NON_EDITABLE_TYPES = ['attachment'];

const isColumnEditable = (
  col: SlackColumn,
  slackListId: string | null,
  _variableMapping?: Record<string, string> | null
) => {
  // Nie editierbar: Dateianhänge
  if (col.type === 'attachment') return false;
  // System-/berechnete Spalten read-only
  const systemNames = ['created_by', 'updated', 'created', 'creator', 'last_updated', 'updated_by', 'timestamp'];
  const n = (col.name || '').toLowerCase().trim();
  if (systemNames.includes(n) || col.id.toLowerCase().includes('created') || col.id.toLowerCase().includes('updated')) return false;

  // Checkbox-Spalten sind immer togglebar (direkter Slack-API-Weg, kein Webhook nötig)
  if (col.type === 'checkbox') return true;

  // Vorquali-Liste: alte Allowlist als Fallback behalten
  if (slackListId === 'F0B56EJPTEZ') {
    return EDITABLE_COLUMN_IDS.includes(col.id) || EDITABLE_COLUMN_NAMES.includes(n);
  }

  // Alle anderen Listen: editierbar, außer explizit ausgeschlossene Typen
  return !NON_EDITABLE_TYPES.includes(col.type || 'text');
};

interface SlackList {
  id: string;
  slack_list_id: string;
  list_name: string | null;
  columns: any;
  last_synced_at: string | null;
  created_at: string;
  webhook_url?: string | null;
  variable_mapping?: Record<string, string> | null;
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

const cellToString = (v: unknown, col?: SlackColumn, lid?: string | null) =>
  renderCellPlain(v, col, lid);

export function SlackListsModule() {
  const [lists, setLists] = useState<SlackList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [items, setItems] = useState<SlackListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ itemId: string; colId: string } | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [errorCell, setErrorCell] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [aliasVersion, setAliasVersion] = useState(0);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newListId, setNewListId] = useState('');
  const [newListName, setNewListName] = useState('');
  const [adding, setAdding] = useState(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [configWebhook, setConfigWebhook] = useState('');
  const [configRows, setConfigRows] = useState<MappingRow[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [aliasOpen, setAliasOpen] = useState(false);

  const activeList = lists.find((l) => l.slack_list_id === activeListId) || null;
  const columns = useMemo<SlackColumn[]>(() => {
    const fromMeta = normalizeColumns(activeList?.columns);
    if (fromMeta.length > 0) return fromMeta;
    const first = items[0];
    if (!first?.fields) return [];
    return Object.keys(first.fields).map((id) => ({ id, name: id }));
  }, [activeList, items]);

  const loadLists = async () => {
    setLoadingLists(true);
    const { data, error } = await supabase
      .from('slack_lists').select('*').eq('context', 'aufgaben').order('created_at', { ascending: false });
    if (error) { toast.error('Listen laden fehlgeschlagen: ' + error.message); setLoadingLists(false); return; }
    const ids = (data || []).map((l: any) => l.slack_list_id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: cnts } = await supabase.from('slack_list_items').select('slack_list_id').in('slack_list_id', ids);
      for (const r of cnts || []) counts[(r as any).slack_list_id] = (counts[(r as any).slack_list_id] || 0) + 1;
    }
    const withCounts = (data || []).map((l: any) => ({ ...l, item_count: counts[l.slack_list_id] || 0 }));
    setLists(withCounts);
    setLoadingLists(false);
    if (!activeListId && withCounts.length > 0) setActiveListId(withCounts[0].slack_list_id);
  };

  const loadItems = async (listId: string) => {
    setLoadingItems(true);
    const { data, error } = await supabase
      .from('slack_list_items').select('*').eq('slack_list_id', listId)
      .order('date_created', { ascending: false });
    if (error) toast.error('Items laden fehlgeschlagen');
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
    const name = newListName.trim();
    if (!id) return;
    setAdding(true);
    try {
      const { error: upErr } = await supabase
        .from('slack_lists')
        .upsert({ slack_list_id: id, list_name: name || null, context: 'aufgaben' } as any, { onConflict: 'slack_list_id' });
      if (upErr) throw upErr;
      const { data, error } = await supabase.functions.invoke('sync-slack-list', { body: { list_id: id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${(data as any).items_synced} Items synchronisiert`);
      setNewListId(''); setNewListName(''); setAddOpen(false);
      await loadLists();
      setActiveListId(id);
    } catch (e: any) {
      toast.error('Fehler: ' + (e.message || 'Unbekannt'));
      await supabase.from('slack_lists').delete().eq('slack_list_id', id).is('last_synced_at', null);
      await loadLists();
    } finally { setAdding(false); }
  };

  const syncList = async (listId: string) => {
    setSyncingId(listId);
    try {
      const { data, error } = await supabase.functions.invoke('sync-slack-list', { body: { list_id: listId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${(data as any).items_synced} Items synchronisiert`);
      await loadLists();
      if (activeListId === listId) await loadItems(listId);
    } catch (e: any) {
      toast.error('Sync fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    } finally { setSyncingId(null); }
  };

  const removeList = async (listId: string) => {
    if (!confirm('Liste wirklich trennen? Alle synchronisierten Items werden gelöscht.')) return;
    const { error } = await supabase.from('slack_lists').delete().eq('slack_list_id', listId);
    if (error) return toast.error(error.message);
    toast.success('Liste getrennt');
    if (activeListId === listId) setActiveListId(null);
    await loadLists();
  };

  const openConfig = () => {
    if (!activeList) return;
    setConfigWebhook(activeList.webhook_url || '');
    const mapping = activeList.variable_mapping || {};
    const rows: MappingRow[] = Object.entries(mapping).map(([colId, varName]) => ({
      colId,
      varName: String(varName || ''),
    }));
    setConfigRows(rows);
    setConfigOpen(true);
  };

  const saveConfig = async () => {
    if (!activeListId) return;
    setSavingConfig(true);
    try {
      const cleanMapping: Record<string, string> = {};
      for (const row of configRows) {
        const colId = String(row.colId || '').trim();
        const varName = String(row.varName || '').trim();
        if (colId && varName) cleanMapping[colId] = varName;
      }
      const { error } = await supabase
        .from('slack_lists')
        .update({
          webhook_url: configWebhook.trim() || null,
          variable_mapping: cleanMapping as any,
        } as any)
        .eq('slack_list_id', activeListId);
      if (error) throw error;
      toast.success('Konfiguration gespeichert');
      setConfigOpen(false);
      await loadLists();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    } finally {
      setSavingConfig(false);
    }
  };

  const saveCell = async (itemId: string, col: SlackColumn, newValue: unknown) => {
    if (!activeListId) return;
    const cellKey = `${itemId}::${col.id}`;
    const item = items.find((i) => i.slack_item_id === itemId);
    const prev = item?.fields?.[col.id];
    const optimistic = (() => {
      const t = col.type;
      if (t === 'select') return { select: newValue ? [newValue as string] : [] };
      if (t === 'multi_select') return { select: Array.isArray(newValue) ? newValue : [] };
      if (t === 'checkbox') return { checkbox: !!newValue };
      if (t === 'date') return { date: newValue as number };
      if (t === 'number') return { value: newValue };
      if (t === 'user') return { user: newValue ? [String(newValue)] : [] };
      return { text: String(newValue ?? '') };
    })();
    setSavingCell(cellKey);
    setItems((curr) => curr.map((i) => i.slack_item_id === itemId
      ? { ...i, fields: { ...i.fields, [col.id]: optimistic } } : i));
    setEditing(null);
    try {
      // Vorquali nutzt weiter den Webhook-Weg; alle anderen Listen direkt via Slack-API
      const fn = activeListId === 'F0B56EJPTEZ' ? 'send-slack-list-update' : 'update-slack-list-item';
      // user: stets als Array senden (leeres Array = niemand)
      const fieldValue = col.type === 'user'
        ? (newValue ? [String(newValue)] : [])
        : newValue;
      const body: any = {
        slack_item_id: itemId,
        slack_list_id: activeListId,
        field_updates: { [col.id]: fieldValue },
      };
      if (fn === 'update-slack-list-item') {
        body.column_types = { [col.id]: col.type };
      }
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Aktualisiert');
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
      setItems((curr) => curr.map((i) => i.slack_item_id === itemId
        ? { ...i, fields: { ...i.fields, [col.id]: prev } } : i));
      setErrorCell(cellKey); setTimeout(() => setErrorCell(null), 2000);
    } finally { setSavingCell(null); }
  };

  const filteredItems = useMemo(() => {
    let r = items;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((it) => columns.some((c) =>
        cellToString(it.fields?.[c.id], c, activeListId).toLowerCase().includes(q)));
    }
    if (sortCol) {
      const def = columns.find((c) => c.id === sortCol);
      r = [...r].sort((a, b) => {
        const av = cellToString(a.fields?.[sortCol], def, activeListId);
        const bv = cellToString(b.fields?.[sortCol], def, activeListId);
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [items, search, sortCol, sortDir, columns, activeListId, aliasVersion]);

  const toggleSort = (colId: string) => {
    if (sortCol === colId) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(colId); setSortDir('asc'); }
  };

  const renameColumnAlias = async (colId: string, currentLabel: string) => {
    if (!activeListId) return;
    const next = window.prompt(
      `Vergib einen lesbaren Namen für die Spalte "${colId}":`,
      currentLabel === colId ? '' : currentLabel,
    );
    if (next == null) return;
    const display = next.trim();
    try {
      if (!display) {
        await supabase.from('slack_list_aliases' as any).delete()
          .eq('slack_list_id', activeListId)
          .eq('alias_type', 'column')
          .eq('slack_id', colId)
          .is('parent_column_id', null);
        toast.success('Alias entfernt');
      } else {
        const { error } = await supabase.from('slack_list_aliases' as any).upsert({
          slack_list_id: activeListId, alias_type: 'column',
          slack_id: colId, parent_column_id: null, display_name: display,
        }, { onConflict: 'slack_list_id,slack_id,parent_column_id' });
        if (error) throw error;
        toast.success('Spalten-Alias gespeichert');
      }
      await loadAliases(activeListId, true);
      setAliasVersion((v) => v + 1);
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    }
  };

  const renameOptionAlias = async (colId: string, optId: string, currentLabel: string) => {
    if (!activeListId) return;
    const next = window.prompt(
      `Vergib einen lesbaren Namen für die Option "${optId}":`,
      currentLabel === optId ? '' : currentLabel,
    );
    if (next == null) return;
    const display = next.trim();
    try {
      if (!display) {
        await supabase.from('slack_list_aliases' as any).delete()
          .eq('slack_list_id', activeListId)
          .eq('alias_type', 'option')
          .eq('slack_id', optId)
          .eq('parent_column_id', colId);
        toast.success('Alias entfernt');
      } else {
        const { error } = await supabase.from('slack_list_aliases' as any).upsert({
          slack_list_id: activeListId, alias_type: 'option',
          slack_id: optId, parent_column_id: colId, display_name: display, display_color: 'gray',
        }, { onConflict: 'slack_list_id,slack_id,parent_column_id' });
        if (error) throw error;
        toast.success('Option-Alias gespeichert');
      }
      await loadAliases(activeListId, true);
      setAliasVersion((v) => v + 1);
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Slack-Listen</h2>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Liste hinzufügen
        </Button>
      </div>

      {loadingLists ? (
        <Skeleton className="h-10 w-full" />
      ) : lists.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Noch keine Slack-Liste angebunden. Über „Liste hinzufügen" eine Slack-List-ID + Namen hinterlegen.
        </CardContent></Card>
      ) : (
        <>
          <Tabs value={activeListId ?? undefined} onValueChange={(v) => setActiveListId(v)}>
            <TabsList className="flex-wrap h-auto">
              {lists.map((l) => (
                <TabsTrigger key={l.slack_list_id} value={l.slack_list_id} className="gap-2">
                  {l.list_name || l.slack_list_id}
                  <Badge variant="outline" className="text-[10px] h-4 px-1">{l.item_count ?? 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {activeList && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {activeList.last_synced_at
                    ? `Zuletzt synct: ${formatDistanceToNow(new Date(activeList.last_synced_at), { locale: de, addSuffix: true })}`
                    : 'Noch nicht synct'}
                  {' · '}{filteredItems.length} / {items.length} Items
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm"
                    onClick={() => syncList(activeList.slack_list_id)}
                    disabled={syncingId === activeList.slack_list_id}>
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5',
                      syncingId === activeList.slack_list_id && 'animate-spin')} />
                    Sync
                  </Button>
                  <Button variant="outline" size="sm" onClick={openConfig}>
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                    Konfigurieren
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAliasOpen(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Anzeige anpassen
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeList(activeList.slack_list_id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="In allen Zellen suchen..." className="pl-9"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <Card className="border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {columns.map((col) => {
                          const active = sortCol === col.id;
                          return (
                            <th key={col.id} onClick={() => toggleSort(col.id)}
                              onAuxClick={(e) => {
                                if (e.button === 1) { e.preventDefault(); renameColumnAlias(col.id, col.name || col.id); }
                              }}
                              title="Alt+Klick um Spaltennamen zu setzen"
                              className="px-4 py-3 text-left cursor-pointer hover:text-primary select-none font-medium">
                              <span
                                className="inline-flex items-center gap-1.5"
                                onClick={(e) => {
                                  if (e.altKey) { e.stopPropagation(); renameColumnAlias(col.id, col.name || col.id); }
                                }}
                              >
                                {getColumnDisplay(col.id, activeListId, col.name || col.id)}
                                {isColumnEditable(col, activeListId, activeList?.variable_mapping) && <Pencil className="h-3 w-3 text-muted-foreground" />}
                                {active
                                  ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                                  : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingItems && Array.from({ length: 4 }).map((_, i) => (
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
                            const editable = isColumnEditable(col, activeListId, activeList?.variable_mapping);
                            const isEditing = editing?.itemId === it.slack_item_id && editing?.colId === col.id && editable;
                            const isSaving = savingCell === cellKey;
                            const isError = errorCell === cellKey;
                            const val = it.fields?.[col.id];
                            const isCheckbox = col.type === 'checkbox';
                            return (
                              <td key={col.id} className={cn('px-3 py-2 align-top transition-colors',
                                isError && 'bg-destructive/20')}>
                                {isCheckbox ? (
                                  <div className="min-h-[28px] flex items-center gap-2 px-1 -mx-1">
                                    <Checkbox
                                      checked={getCheckboxValue(val)}
                                      disabled={isSaving}
                                      onClick={(e) => e.stopPropagation()}
                                      onCheckedChange={(checked) => {
                                        saveCell(it.slack_item_id, col as SlackColumn, checked === true);
                                      }}
                                    />
                                    {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                  </div>
                                ) : isEditing ? (
                                  <SlackCellEditor
                                    field={val} column={col as SlackColumn} slackListId={activeListId}
                                    onSave={async (nv) => { await saveCell(it.slack_item_id, col as SlackColumn, nv); }}
                                    onCancel={() => setEditing(null)} />
                                ) : (
                                  <div onClick={editable ? () => setEditing({ itemId: it.slack_item_id, colId: col.id }) : undefined}
                                    className={cn('min-h-[28px] flex items-center gap-2 rounded px-1 -mx-1',
                                      editable ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default')}>
                                    {(() => {
                                      if (typeof val === 'boolean') {
                                        return renderCellNode(val, col as SlackColumn);
                                      }
                                      const pills = getCellPills(val, col as SlackColumn, activeListId);
                                      if (pills) {
                                        if (pills.length === 0) return <span className="text-muted-foreground/50">↩</span>;
                                        return (
                                          <div className="flex flex-wrap gap-1">
                                            {pills.map((p) => (
                                              <button key={p.id} type="button"
                                                title={`Alt+Klick um Label umzubenennen (Slack-ID: ${p.id})`}
                                                onClick={(e) => {
                                                  if (!e.altKey) return;
                                                  e.stopPropagation();
                                                  renameOptionAlias(col.id, p.id, p.label);
                                                }}
                                                className={cn('inline-flex items-center rounded-full border px-3 h-6 text-xs font-medium transition-opacity hover:opacity-80', p.className)}>
                                                {p.label}
                                              </button>
                                            ))}
                                          </div>
                                        );
                                      }
                                      const plain = renderCellPlain(val, col as SlackColumn, activeListId);
                                      if (!plain) return <span className="text-muted-foreground/50">↩</span>;
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
                open={aliasOpen}
                onOpenChange={setAliasOpen}
                slackListId={activeList.slack_list_id}
                columns={columns as any}
                items={items as any}
                onSaved={async () => {
                  await loadAliases(activeList.slack_list_id, true);
                  setAliasVersion((v) => v + 1);
                }}
              />
            </>
          )}
        </>
      )}

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Liste konfigurieren</DialogTitle>
            <DialogDescription>
              Webhook-URL und Variablen-Mapping für den Slack-Workflow dieser Liste.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-webhook">Slack-Workflow Webhook-URL</Label>
              <Input id="cfg-webhook" placeholder="https://hooks.slack.com/triggers/..."
                className="font-mono text-xs"
                value={configWebhook} onChange={(e) => setConfigWebhook(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Wird beim Speichern einer Zelle aufgerufen. Leer lassen, um Schreib-Sync zu deaktivieren.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Variablen-Mapping</Label>
              <p className="text-[11px] text-muted-foreground">
                Trage die Variablennamen deines Slack-Workflows ein und wähle, welche Spalte den Wert liefert. <span className="font-mono">zeilenid</span> wird automatisch mitgesendet und muss nicht gemappt werden.
              </p>
              <div className="space-y-2">
                {configRows.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    Noch keine Variablen. Füge mit "+ Variable hinzufügen" eine hinzu.
                  </p>
                )}
                {configRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Input
                      placeholder="slack_variable"
                      className="font-mono text-xs h-8"
                      value={row.varName}
                      onChange={(e) =>
                        setConfigRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, varName: e.target.value } : r))
                        )
                      }
                    />
                    <Select
                      value={row.colId || undefined}
                      onValueChange={(val) =>
                        setConfigRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, colId: val } : r))
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Spalte wählen…" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((col) => (
                          <SelectItem key={col.id} value={col.id} className="text-xs">
                            {getColumnDisplay(col.id, activeListId, col.name || col.id)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setConfigRows((rows) => rows.filter((_, i) => i !== idx))
                      }
                      aria-label="Variable entfernen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setConfigRows((rows) => [...rows, { colId: '', varName: '' }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Variable hinzufügen
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfigOpen(false)}>Abbrechen</Button>
            <Button onClick={saveConfig} disabled={savingConfig}>
              {savingConfig && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slack-Liste hinzufügen</DialogTitle>
            <DialogDescription>
              Verknüpfe eine Slack-Liste mit einem eigenen Namen. Items + Schema werden direkt geladen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="slist-name">Eigener Name</Label>
              <Input id="slist-name" placeholder="z.B. Sprint Backlog"
                value={newListName} onChange={(e) => setNewListName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slist-id">Slack List ID</Label>
              <Input id="slist-id" placeholder="z.B. F12345678" className="font-mono"
                value={newListId} onChange={(e) => setNewListId(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Abbrechen</Button>
            <Button onClick={addList} disabled={adding || !newListId.trim()}>
              {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Hinzufügen & Syncen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
