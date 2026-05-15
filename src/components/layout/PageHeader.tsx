import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbProp {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Single breadcrumb back-link. Max one. */
  breadcrumb?: BreadcrumbProp;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** `xl` = main page (Hauptseite), `lg` = sub-page. */
  size?: 'lg' | 'xl';
  className?: string;
  /** Centered hero variant (used by main showcase page). */
  centered?: boolean;
  /** Alignment for sub-pages. `center` mirrors hero with breadcrumb + actions. */
  align?: 'left' | 'center';
}

const titleSize: Record<'lg' | 'xl', string> = {
  lg: 'text-4xl md:text-5xl font-extrabold tracking-tight leading-tight',
  xl: 'text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]',
};

const descSize: Record<'lg' | 'xl', string> = {
  lg: 'text-base md:text-lg',
  xl: 'text-lg md:text-xl',
};

/**
 * Single PageHeader used by every Showcase page. Use `size="xl"` on the
 * Hauptseite, `size="lg"` on Sub-Pages and Detail-Pages.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  size = 'lg',
  centered = false,
  align = 'left',
  className,
}: PageHeaderProps) {
  if (centered) {
    return (
      <header className={cn('text-center max-w-3xl mx-auto mb-16 pt-8', className)}>
        <h1 className={cn(titleSize[size], 'text-gray-900 dark:text-white')}>{title}</h1>
        {description && (
          <p className={cn(descSize[size], 'text-gray-500 dark:text-gray-400 mt-5 font-normal')}>
            {description}
          </p>
        )}
      </header>
    );
  }

  const isCenter = align === 'center';

  return (
    <header className={cn('mb-10', isCenter && 'text-center', className)}>
      {breadcrumb &&
        (breadcrumb.href ? (
          <Link
            to={breadcrumb.href}
            className={cn(
              'inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3 transition-colors',
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            {breadcrumb.label}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            <ArrowLeft className="w-4 h-4" />
            {breadcrumb.label}
          </span>
        ))}

      <div
        className={cn(
          'flex flex-col gap-6',
          isCenter
            ? 'items-center'
            : 'md:flex-row md:items-end md:justify-between',
        )}
      >
        <div className={cn('min-w-0', isCenter && 'max-w-2xl mx-auto')}>
          <h1 className={cn(titleSize[size], 'text-gray-900 dark:text-white')}>{title}</h1>
          {description && (
            <p
              className={cn(
                descSize[size],
                'text-gray-500 dark:text-gray-400 mt-2 font-normal',
              )}
            >
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div
            className={cn(
              'flex flex-wrap gap-2 shrink-0',
              isCenter && 'justify-center',
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
