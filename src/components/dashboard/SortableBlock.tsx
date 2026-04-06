import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

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
      className={`sortable-block relative ${isDragging ? 'opacity-40 outline-2 outline-dashed outline-primary rounded-xl' : ''}`}
      {...attributes}
    >
      {!disabled && (
        <div
          {...listeners}
          className="drag-handle absolute top-1.5 left-1.5 z-50 w-[22px] h-[22px] rounded-[5px] bg-card border border-border flex items-center justify-center cursor-grab opacity-0 transition-all duration-150 shadow-sm select-none pointer-events-auto hidden md:flex"
          aria-label="Block verschieben"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
      {children}
    </div>
  );
}
