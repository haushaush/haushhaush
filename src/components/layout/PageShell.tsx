import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  /** Extra class for the inner constrained container. */
  innerClassName?: string;
}

/**
 * Single page-shell used by every Showcase page (Hauptseite, Sub-Pages,
 * Detail-Pages). Provides the off-white surface, max-width and consistent
 * horizontal/vertical padding. NEVER write a custom page-container in a
 * Showcase page — wrap the page in `<PageShell>` instead.
 */
export function PageShell({ children, className, innerClassName }: PageShellProps) {
  return (
    <div className={cn('min-h-screen bg-[#fafaf7] dark:bg-gray-950 pb-32', className)}>
      <main className="w-full pt-10">
        <div className={cn('max-w-7xl mx-auto px-6 md:px-10 lg:px-16 xl:px-20', innerClassName)}>
          {children}
        </div>
      </main>
    </div>
  );
}
