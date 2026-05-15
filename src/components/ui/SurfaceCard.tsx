import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  /** Adds hover-lift + shadow + border emphasis transition. */
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

const paddingMap: Record<NonNullable<SurfaceCardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-8',
};

/**
 * Primitive Apple-style surface card. Use this everywhere a raised content
 * container is needed in the Showcase / Sales surfaces.
 *
 * - default: rounded-2xl, subtle border, soft shadow
 * - interactive: hover-lift + emphasised shadow/border
 *
 * NEVER write raw `rounded-2xl border bg-white shadow-sm` Tailwind stacks
 * outside this component for the showcase pages.
 */
export const SurfaceCard = React.forwardRef<HTMLElement, SurfaceCardProps>(
  ({ as: Component = 'div', interactive = false, padding = 'md', className, children, ...props }, ref) => {
    return (
      <Component
        ref={ref as any}
        className={cn(
          'rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm',
          interactive &&
            'transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700',
          paddingMap[padding],
          className,
        )}
        {...props}
      >
        {children}
      </Component>
    );
  },
);
SurfaceCard.displayName = 'SurfaceCard';
