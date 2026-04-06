import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';

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
      {/* Handle strip — in normal flow ABOVE content, not absolute */}
      {!disabled && (
        <div
          {...listeners}
          className="drag-handle hidden md:flex items-center justify-center gap-1.5 w-full h-6 mb-1.5 cursor-grab opacity-0 transition-all duration-150 rounded-md select-none"
        >
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      {/* Block content — completely separate from handle */}
      <div className="w-full">{children}</div>
    </div>
  );
}
