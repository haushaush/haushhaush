import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Columns3, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnDef, ColumnId } from './metaColumns';

interface Props {
  columns: ColumnDef[];
  visible: ColumnId[];
  onChange: (ids: ColumnId[]) => void;
  onReset: () => void;
}

export function MetaColumnPicker({ columns, visible, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (id: ColumnId, alwaysVisible?: boolean) => {
    if (alwaysVisible) return;
    if (visible.includes(id)) onChange(visible.filter((v) => v !== id));
    else onChange([...visible, id]);
  };

  const visibleCount = visible.length;

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="h-9">
        <Columns3 className="h-4 w-4 mr-2" />
        Spalten
        <span className="ml-1.5 text-xs text-muted-foreground">({visibleCount})</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg flex flex-col">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spalten</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Zurücksetzen
            </Button>
          </div>
          <div className="overflow-y-auto max-h-80 p-2">
            {columns.map((col) => {
              const checked = visible.includes(col.id);
              return (
                <label
                  key={col.id}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted text-sm',
                    col.alwaysVisible && 'opacity-70 cursor-not-allowed hover:bg-transparent'
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={col.alwaysVisible}
                    onCheckedChange={() => toggle(col.id, col.alwaysVisible)}
                  />
                  <span className="flex-1 text-foreground">{col.label}</span>
                  {col.alwaysVisible && (
                    <span className="text-[10px] text-muted-foreground uppercase">Pflicht</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
