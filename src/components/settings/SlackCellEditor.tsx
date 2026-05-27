import { useEffect, useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getOptionDisplay,
  colorPillClass,
  renderCellPlain,
  type SlackColumn,
  type SlackChoice,
} from '@/utils/slack-list-renderer';

interface Props {
  field: unknown;
  column: SlackColumn;
  slackListId: string | null;
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
}

function getChoices(col: SlackColumn): SlackChoice[] {
  const o: any = col.options;
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o.choices)) return o.choices;
  if (Array.isArray(o.values)) return o.values;
  return [];
}

function extractSelectedIds(field: unknown): string[] {
  if (!field) return [];
  if (Array.isArray(field)) return field.filter((v) => typeof v === 'string');
  if (typeof field === 'object') {
    const f: any = field;
    if (Array.isArray(f.select)) return f.select.filter((v: unknown) => typeof v === 'string');
    if (Array.isArray(f.value)) return f.value.filter((v: unknown) => typeof v === 'string');
    if (typeof f.value === 'string') return [f.value];
  }
  if (typeof field === 'string') return [field];
  return [];
}

export function SlackCellEditor({ field, column, slackListId, onSave, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const type = column.type || 'text';

  const handleSave = async (newVal: unknown) => {
    setSaving(true);
    try {
      await onSave(newVal);
    } finally {
      setSaving(false);
    }
  };

  // ---------- SELECT ----------
  if (type === 'select') {
    const choices = getChoices(column);
    const current = extractSelectedIds(field)[0] || '';
    return (
      <Select
        defaultOpen
        value={current}
        onValueChange={async (v) => {
          await handleSave(v);
        }}
        disabled={saving}
        onOpenChange={(open) => { if (!open) onCancel(); }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="– wählen –" />
        </SelectTrigger>
        <SelectContent>
          {choices.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Optionen</div>
          )}
          {choices.map((c) => {
            const fallback = c.label || c.name || c.id;
            const disp = getOptionDisplay(c.id, column.id, slackListId, fallback, c.color || 'gray');
            return (
              <SelectItem key={c.id} value={c.id}>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 h-5 text-[11px] font-medium',
                    colorPillClass(disp.color),
                  )}
                >
                  {disp.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  // ---------- MULTI_SELECT ----------
  if (type === 'multi_select') {
    const choices = getChoices(column);
    const [selected, setSelected] = useState<string[]>(extractSelectedIds(field));
    return (
      <Popover defaultOpen onOpenChange={(open) => { if (!open) onCancel(); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 px-2 text-xs rounded border border-input bg-background text-left w-full"
            disabled={saving}
          >
            {selected.length > 0
              ? `${selected.length} ausgewählt`
              : '– wählen –'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2 space-y-1 max-h-72 overflow-auto">
          {choices.length === 0 && (
            <div className="text-xs text-muted-foreground">Keine Optionen</div>
          )}
          {choices.map((c) => {
            const checked = selected.includes(c.id);
            const fallback = c.label || c.name || c.id;
            const disp = getOptionDisplay(c.id, column.id, slackListId, fallback, c.color || 'gray');
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={async (v) => {
                    const next = v
                      ? [...selected, c.id]
                      : selected.filter((x) => x !== c.id);
                    setSelected(next);
                    await handleSave(next);
                  }}
                />
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 h-5 text-[11px] font-medium',
                    colorPillClass(disp.color),
                  )}
                >
                  {disp.label}
                </span>
              </label>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  // ---------- CHECKBOX ----------
  if (type === 'checkbox') {
    const checked =
      field === true ||
      (typeof field === 'object' && field && (field as any).checkbox === true);
    return (
      <Checkbox
        defaultChecked={checked}
        disabled={saving}
        onCheckedChange={async (v) => {
          await handleSave(v === true);
        }}
      />
    );
  }

  // ---------- DATE ----------
  if (type === 'date') {
    const current = (() => {
      const f: any = field;
      const ts =
        typeof f === 'number' ? f :
        typeof f?.date === 'number' ? f.date :
        typeof f?.value === 'number' ? f.value : null;
      if (!ts) return '';
      const d = new Date(ts * 1000);
      return d.toISOString().slice(0, 10);
    })();
    const [val, setVal] = useState(current);
    return (
      <Input
        type="date"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={async () => {
          if (!val) return onCancel();
          await handleSave(Math.floor(new Date(val).getTime() / 1000));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        disabled={saving}
        className="h-7 text-sm"
      />
    );
  }

  // ---------- NUMBER ----------
  if (type === 'number') {
    const init = renderCellPlain(field, column, slackListId);
    const [val, setVal] = useState(init);
    return (
      <Input
        type="number"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={async () => {
          if (val === init) return onCancel();
          await handleSave(val === '' ? null : Number(val));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') onCancel();
        }}
        disabled={saving}
        className="h-7 text-sm"
      />
    );
  }

  // ---------- DEFAULT: TEXT / link / user ----------
  const init = renderCellPlain(field, column, slackListId);
  const [val, setVal] = useState(init);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={async () => {
          if (val === init) return onCancel();
          await handleSave(val);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') onCancel();
        }}
        disabled={saving}
        className="h-7 text-sm pr-7"
      />
      {saving && <Loader2 className="absolute right-1.5 top-1.5 h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
