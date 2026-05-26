import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Loader2, Save, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  loadAliases, getColumnDisplay, getOptionDisplay,
  SLACK_COLORS, colorPillClass, type SlackColumn,
} from '@/utils/slack-list-renderer';

interface OptionIdInfo { id: string; rawLabel?: string; rawColor?: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slackListId: string;
  columns: SlackColumn[];
  /** All item rows — used to discover option_ids that appeared in the data. */
  items: Array<{ fields: Record<string, unknown> }>;
  onSaved?: () => void;
}

function extractIdsFromCell(cell: any): string[] {
  if (cell == null) return [];
  if (typeof cell === 'string') return /^Opt[A-Z0-9]+$/.test(cell) ? [cell] : [];
  if (Array.isArray(cell)) return cell.filter((v) => typeof v === 'string' && /^Opt[A-Z0-9]+$/.test(v));
  if (typeof cell === 'object') {
    if (Array.isArray((cell as any).select)) return (cell as any).select.filter((v: unknown) => typeof v === 'string');
    if (Array.isArray((cell as any).value)) return (cell as any).value.filter((v: unknown) => typeof v === 'string');
    if (typeof (cell as any).value === 'string' && /^Opt[A-Z0-9]+$/.test((cell as any).value)) return [(cell as any).value];
  }
  return [];
}

export function SlackAliasEditor({ open, onOpenChange, slackListId, columns, items, onSaved }: Props) {
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [colDrafts, setColDrafts] = useState<Record<string, string>>({});
  const [optDrafts, setOptDrafts] = useState<Record<string, { label: string; color: string }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [autoMapping, setAutoMapping] = useState(false);

  // Refresh alias data when opened
  useEffect(() => {
    if (!open) return;
    loadAliases(slackListId, true).then(() => setVersion((v) => v + 1));
  }, [open, slackListId]);

  // Build option-id list per column from observed items + schema choices
  const optionsByColumn = useMemo(() => {
    const map = new Map<string, OptionIdInfo[]>();
    for (const col of columns) {
      if (col.type !== 'select' && col.type !== 'multi_select') continue;
      const seen = new Map<string, OptionIdInfo>();
      const choices: any[] = Array.isArray((col.options as any)?.choices)
        ? (col.options as any).choices
        : Array.isArray(col.options) ? (col.options as any) : [];
      for (const ch of choices) {
        if (ch?.id) seen.set(ch.id, { id: ch.id, rawLabel: ch.label, rawColor: ch.color });
      }
      for (const it of items) {
        const ids = extractIdsFromCell(it.fields?.[col.id]);
        for (const id of ids) if (!seen.has(id)) seen.set(id, { id });
      }
      map.set(col.id, Array.from(seen.values()));
    }
    return map;
  }, [columns, items]);

  // Initialize drafts from current aliases (whenever version changes)
  useEffect(() => {
    const cd: Record<string, string> = {};
    for (const col of columns) {
      const existing = getColumnDisplay(col.id, slackListId, '');
      cd[col.id] = existing || '';
    }
    setColDrafts(cd);

    const od: Record<string, { label: string; color: string }> = {};
    for (const [colId, opts] of optionsByColumn.entries()) {
      for (const o of opts) {
        const resolved = getOptionDisplay(o.id, colId, slackListId, '', '');
        od[`${colId}:${o.id}`] = {
          label: resolved.label || '',
          color: resolved.color || o.rawColor || 'gray',
        };
      }
    }
    setOptDrafts(od);
  }, [version, columns, slackListId, optionsByColumn]);

  const refresh = async () => {
    await loadAliases(slackListId, true);
    setVersion((v) => v + 1);
    onSaved?.();
  };

  const saveColumnAlias = async (colId: string) => {
    const display = (colDrafts[colId] || '').trim();
    setSaving(`col:${colId}`);
    try {
      if (!display) {
        await supabase.from('slack_list_aliases' as any).delete()
          .eq('slack_list_id', slackListId)
          .eq('alias_type', 'column')
          .eq('slack_id', colId)
          .is('parent_column_id', null);
        toast.success('Alias entfernt');
      } else {
        const { error } = await supabase.from('slack_list_aliases' as any).upsert({
          slack_list_id: slackListId,
          alias_type: 'column',
          slack_id: colId,
          parent_column_id: null,
          display_name: display,
        }, { onConflict: 'slack_list_id,slack_id,parent_column_id' });
        if (error) throw error;
        toast.success('Alias gespeichert');
      }
      await refresh();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    } finally {
      setSaving(null);
    }
  };

  const saveOptionAlias = async (colId: string, optId: string) => {
    const draft = optDrafts[`${colId}:${optId}`] || { label: '', color: 'gray' };
    const label = draft.label.trim();
    setSaving(`opt:${colId}:${optId}`);
    try {
      if (!label) {
        await supabase.from('slack_list_aliases' as any).delete()
          .eq('slack_list_id', slackListId)
          .eq('alias_type', 'option')
          .eq('slack_id', optId)
          .eq('parent_column_id', colId);
        toast.success('Alias entfernt');
      } else {
        const { error } = await supabase.from('slack_list_aliases' as any).upsert({
          slack_list_id: slackListId,
          alias_type: 'option',
          slack_id: optId,
          parent_column_id: colId,
          display_name: label,
          display_color: draft.color || 'gray',
        }, { onConflict: 'slack_list_id,slack_id,parent_column_id' });
        if (error) throw error;
        toast.success('Alias gespeichert');
      }
      await refresh();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    } finally {
      setSaving(null);
    }
  };

  const autoMapFromSchema = async () => {
    setAutoMapping(true);
    try {
      const rows: any[] = [];
      for (const col of columns) {
        if (col.name && col.name !== col.id) {
          rows.push({
            slack_list_id: slackListId,
            alias_type: 'column',
            slack_id: col.id,
            parent_column_id: null,
            display_name: col.name,
          });
        }
        const choices: any[] = Array.isArray((col.options as any)?.choices)
          ? (col.options as any).choices
          : Array.isArray(col.options) ? (col.options as any) : [];
        for (const ch of choices) {
          if (ch?.id && ch?.label && ch.label !== ch.id) {
            rows.push({
              slack_list_id: slackListId,
              alias_type: 'option',
              slack_id: ch.id,
              parent_column_id: col.id,
              display_name: ch.label,
              display_color: ch.color || 'gray',
            });
          }
        }
      }
      if (rows.length === 0) {
        toast.info('Keine automatisch übernehmbaren Mappings gefunden.');
        return;
      }
      // upsert in chunks
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase.from('slack_list_aliases' as any)
          .upsert(chunk, { onConflict: 'slack_list_id,slack_id,parent_column_id' });
        if (error) throw error;
      }
      toast.success(`${rows.length} Aliase aus Slack-Schema übernommen`);
      await refresh();
    } catch (e: any) {
      toast.error('Auto-Map fehlgeschlagen: ' + (e.message || 'Unbekannt'));
    } finally {
      setAutoMapping(false);
    }
  };

  const selectCols = columns.filter((c) => c.type === 'select' || c.type === 'multi_select');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Anzeige anpassen</DialogTitle>
          <DialogDescription>
            Diese Aliase überschreiben nur die Hub-Anzeige. Die Slack-Daten bleiben unverändert.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">List-ID: <span className="font-mono">{slackListId}</span></p>
          <Button size="sm" variant="outline" onClick={autoMapFromSchema} disabled={autoMapping}>
            {autoMapping ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Aus Slack-Schema übernehmen
          </Button>
        </div>

        <Tabs defaultValue="columns" className="flex-1 overflow-hidden flex flex-col">
          <TabsList>
            <TabsTrigger value="columns">Spalten ({columns.length})</TabsTrigger>
            <TabsTrigger value="options">Optionen ({selectCols.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="columns" className="flex-1 overflow-y-auto mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Slack-ID</th>
                    <th className="px-3 py-2 text-left">Slack-Original</th>
                    <th className="px-3 py-2 text-left">Hub-Anzeige</th>
                    <th className="px-3 py-2 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col) => {
                    const slackOriginal = col.name && col.name !== col.id ? col.name : '';
                    return (
                      <tr key={col.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{col.id}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {slackOriginal || <span className="italic opacity-50">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={colDrafts[col.id] ?? ''}
                            onChange={(e) => setColDrafts((d) => ({ ...d, [col.id]: e.target.value }))}
                            placeholder={slackOriginal || 'Anzeigename'}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => saveColumnAlias(col.id)}
                            disabled={saving === `col:${col.id}`}
                          >
                            {saving === `col:${col.id}`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Save className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="options" className="flex-1 overflow-y-auto mt-3 space-y-3">
            {selectCols.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Keine Select-Spalten in dieser Liste.</p>
            )}
            {selectCols.map((col) => {
              const opts = optionsByColumn.get(col.id) || [];
              const isOpen = expanded[col.id] ?? true;
              const label = getColumnDisplay(col.id, slackListId, col.name || col.id);
              return (
                <div key={col.id} className="border border-border rounded-md">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [col.id]: !isOpen }))}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="font-medium text-sm">{label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{col.id}</span>
                      <Badge variant="outline" className="text-xs">{opts.length}</Badge>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border">
                      {opts.length === 0 && (
                        <p className="text-xs text-muted-foreground px-3 py-3">Noch keine Option-IDs beobachtet.</p>
                      )}
                      {opts.map((o) => {
                        const key = `${col.id}:${o.id}`;
                        const draft = optDrafts[key] || { label: '', color: 'gray' };
                        const slackOriginal = o.rawLabel && o.rawLabel !== o.id ? o.rawLabel : '';
                        return (
                          <div key={o.id} className="flex items-center gap-2 px-3 py-2 border-t border-border first:border-t-0">
                            <span className="font-mono text-xs text-muted-foreground w-32 truncate" title={o.id}>{o.id}</span>
                            <span className="text-xs text-muted-foreground w-28 truncate">
                              {slackOriginal || <span className="italic opacity-50">—</span>}
                            </span>
                            <Input
                              value={draft.label}
                              onChange={(e) => setOptDrafts((d) => ({ ...d, [key]: { ...draft, label: e.target.value } }))}
                              placeholder="Hub-Anzeige"
                              className="h-8 text-sm flex-1"
                            />
                            <Select
                              value={draft.color}
                              onValueChange={(v) => setOptDrafts((d) => ({ ...d, [key]: { ...draft, color: v } }))}
                            >
                              <SelectTrigger className="h-8 w-32">
                                <SelectValue>
                                  <span className={cn('inline-flex items-center rounded-full border px-2 h-5 text-xs', colorPillClass(draft.color))}>
                                    {draft.color}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {SLACK_COLORS.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    <span className={cn('inline-flex items-center rounded-full border px-2 h-5 text-xs', colorPillClass(c))}>{c}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => saveOptionAlias(col.id, o.id)}
                              disabled={saving === `opt:${col.id}:${o.id}`}
                            >
                              {saving === `opt:${col.id}:${o.id}`
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Save className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
