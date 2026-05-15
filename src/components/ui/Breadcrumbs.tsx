import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-xs text-gray-500 dark:text-gray-400', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center min-w-0">
            {i > 0 && <ChevronRight className="w-3 h-3 mx-1.5 shrink-0 text-gray-400 dark:text-gray-600" />}
            {item.href && !isLast ? (
              <Link to={item.href} className="hover:text-gray-900 dark:hover:text-white transition-colors truncate">
                {item.label}
              </Link>
            ) : (
              <span className={cn('truncate', isLast && 'font-semibold text-gray-900 dark:text-white')}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
