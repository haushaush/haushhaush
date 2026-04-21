import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableThProps {
  field: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  align?: 'left' | 'right';
  children: React.ReactNode;
}

export function SortableTh({ field, sortField, sortDir, onSort, align = 'left', children }: SortableThProps) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        'px-4 py-3 font-medium cursor-pointer hover:text-primary select-none transition-colors',
        align === 'right' ? 'text-right' : 'text-left'
      )}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {children}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}
