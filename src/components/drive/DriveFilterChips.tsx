import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'all', label: 'Alle' },
  { key: 'folder', label: 'Ordner' },
  { key: 'document', label: 'Dokumente' },
  { key: 'image', label: 'Bilder' },
  { key: 'video', label: 'Videos' },
  { key: 'pdf', label: 'PDFs' },
] as const;

export type DriveFilter = (typeof FILTERS)[number]['key'];

interface Props {
  value: DriveFilter;
  onChange: (v: DriveFilter) => void;
}

export function DriveFilterChips({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => (
        <Button
          key={f.key}
          variant="ghost"
          size="sm"
          onClick={() => onChange(f.key)}
          className={cn(
            'h-8 px-3 rounded-full text-xs',
            value === f.key
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted hover:bg-muted/80',
          )}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}
