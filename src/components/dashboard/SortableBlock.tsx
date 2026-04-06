import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
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
        'sortable-block relative group/drag',
        isDragging && 'opacity-40 outline-2 outline-dashed outline-primary rounded-xl'
      )}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className="drag-handle absolute top-2 left-2 z-10 opacity-0 group-hover/drag:opacity-100 transition-opacity duration-150 cursor-grab active:cursor-grabbing bg-card border border-border rounded p-1 shadow-sm hover:border-primary hover:text-primary text-muted-foreground hidden md:flex items-center justify-center"
          aria-label="Block verschieben"
          title="Block verschieben"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}
