import { ChevronRight } from 'lucide-react';

export type Crumb = { id: string; name: string };

interface Props {
  crumbs: Crumb[];
  onNavigate: (index: number) => void;
}

export function DriveBreadcrumbs({ crumbs, onNavigate }: Props) {
  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="Drive Breadcrumb">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <div key={c.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
            {last ? (
              <span className="font-medium text-foreground">{c.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(i)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {c.name}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
