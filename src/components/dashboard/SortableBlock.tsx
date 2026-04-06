import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableBlockProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
}

export function SortableBlock({ id, children, disabled }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'sortable-block relative pt-7',
        isDragging && 'opacity-40 outline-2 outline-dashed outline-primary rounded-xl'
      )}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className="drag-handle absolute top-1.5 left-1/2 -translate-x-1/2 z-20 opacity-35 hover:opacity-100 transition-all duration-150 cursor-grab active:cursor-grabbing bg-card border border-border rounded-md px-3 py-0.5 shadow-sm hidden md:flex items-center gap-1.5 select-none hover:bg-primary/10 hover:border-primary hover:text-primary text-muted-foreground"
          aria-label="Block verschieben"
          title="Block verschieben"
        >
          <GripHorizontal className="h-3.5 w-3.5" />
          <span className="text-[11px] font-normal">bewegen</span>
        </button>
      )}
      {children}
    </div>
  );
}
