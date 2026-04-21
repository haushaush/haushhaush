import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'active' | 'paused' | 'archived';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'active', label: 'Aktiv' },
  { value: 'paused', label: 'Pausiert' },
  { value: 'archived', label: 'Archiviert' },
];

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  count?: number;
}

export function MetaFilterBar({ search, onSearchChange, status, onStatusChange, count }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Suche nach Name…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      <div className="flex items-center gap-1 bg-muted/40 rounded-md p-1">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant="ghost"
            size="sm"
            onClick={() => onStatusChange(f.value)}
            className={cn(
              'h-7 px-3 text-xs',
              status === f.value && 'bg-background shadow-sm text-foreground'
            )}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {typeof count === 'number' && (
        <span className="text-xs text-muted-foreground ml-auto">{count} Einträge</span>
      )}
    </div>
  );
}

export function matchesStatus(rowStatus: string | undefined, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const s = (rowStatus || '').toUpperCase();
  if (filter === 'active') return s === 'ACTIVE';
  if (filter === 'paused') return s === 'PAUSED' || s.includes('PAUSED');
  if (filter === 'archived') return s === 'ARCHIVED' || s === 'DELETED';
  return true;
}
