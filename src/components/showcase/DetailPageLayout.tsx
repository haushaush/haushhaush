import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function ShellNoPad({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 pb-32">
      <main className="w-full">
        <div className="max-w-7xl mx-auto px-6 md:px-10 lg:px-16 xl:px-20">{children}</div>
      </main>
    </div>
  );
}

export interface DetailPageLayoutProps {
  backHref: string;
  backLabel: string;

  isAdmin?: boolean;
  editMode?: boolean;
  onEditToggle?: () => void;

  /** Action-Buttons rechts neben "Fertig", nur sichtbar im Edit-Mode */
  editActions?: React.ReactNode;
  /** Optionaler Share-Handler. Default: kopiert window.location.href */
  onShare?: () => void;
  shareLabel?: string;

  hero: React.ReactNode;
  infoPanel: React.ReactNode;
  belowContent?: React.ReactNode;
  editForm?: React.ReactNode;
}

export function DetailPageLayout({
  backHref,
  backLabel,
  isAdmin = false,
  editMode = false,
  onEditToggle,
  editActions,
  onShare,
  shareLabel = 'Teilen',
  hero,
  infoPanel,
  belowContent,
  editForm,
}: DetailPageLayoutProps) {
  const handleShare = async () => {
    if (onShare) return onShare();
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link kopiert');
    } catch {
      toast.info(window.location.href);
    }
  };

  return (
    <ShellNoPad>
      {/* STICKY HEADER */}
      <div className="sticky top-0 z-20 -mx-6 md:-mx-10 lg:-mx-16 xl:-mx-20 px-6 md:px-10 lg:px-16 xl:px-20 mb-8 bg-[#fafaf7]/85 dark:bg-gray-950/85 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="flex items-center justify-between py-4 gap-3">
          <Link
            to={backHref}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{shareLabel}</span>
            </button>

            {isAdmin && (
              <>
                {editMode && editActions}
                <button
                  onClick={onEditToggle}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl border transition-all',
                    editMode
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700',
                  )}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {editMode ? 'Fertig' : 'Bearbeiten'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* TOP BLOCK: Two-Column 7/5 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-12">
        <div className="lg:col-span-7 flex flex-col">{hero}</div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">{infoPanel}</div>
        </div>
      </div>

      {belowContent && <div className="space-y-6 mb-12">{belowContent}</div>}

      {editMode && editForm && (
        <div className="space-y-6 mb-12 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <Pencil className="w-4 h-4 text-gray-400" />
            <span className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              Admin-Bereich
            </span>
          </div>
          {editForm}
        </div>
      )}
    </ShellNoPad>
  );
}

/* ---------------- HERO ---------------- */

export function DetailHero({
  children,
  aspect = 'video',
  className,
}: {
  children: React.ReactNode;
  aspect?: 'video' | 'square' | 'adaptive';
  className?: string;
}) {
  const aspectClass = aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : '';
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden h-full flex flex-col">
      <div
        className={cn(
          'relative bg-gray-50 dark:bg-gray-800 flex-1',
          aspectClass,
          aspect === 'adaptive' && 'min-h-[460px]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- INFO PANEL ---------------- */

export function DetailInfoPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function InfoSection({
  children,
  divider = true,
  className,
}: {
  children: React.ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-5', divider && 'border-b border-gray-100 dark:border-gray-800 last:border-b-0', className)}>
      {children}
    </div>
  );
}

export function InfoSectionTitle({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
      <h3 className="text-xs uppercase tracking-[0.08em] font-bold text-gray-500 dark:text-gray-400">{children}</h3>
    </div>
  );
}

/* ---------------- METRIC LARGE ---------------- */

export function MetricLarge({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-bold text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div
        className={cn(
          'text-2xl font-extrabold tabular-nums leading-none',
          highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ---------------- DETAIL ROW (Apple Settings) ---------------- */

export function DetailRowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('space-y-3', className)}>{children}</dl>;
}

export function DetailRow({
  label,
  value,
  children,
  capitalize,
  mono,
  highlight,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  capitalize?: boolean;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-gray-500 dark:text-gray-400 font-medium shrink-0">{label}</dt>
      <dd
        className={cn(
          'text-sm text-right truncate min-w-0',
          capitalize && 'capitalize',
          mono && 'font-mono text-xs',
          highlight ? 'font-extrabold text-teal-600 dark:text-teal-400' : 'font-semibold text-gray-900 dark:text-white',
        )}
      >
        {value ?? children}
      </dd>
    </div>
  );
}

/* ---------------- SKELETON ---------------- */

export function DetailPageSkeleton() {
  return (
    <ShellNoPad>
      <div className="animate-pulse">
        <div className="flex items-center justify-between py-4 mb-8">
          <div className="h-5 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-9 w-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          <div className="lg:col-span-7">
            <div className="aspect-video bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          </div>
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
              <div className="h-8 w-full bg-gray-200 dark:bg-gray-800 rounded mb-5" />
              <div className="grid grid-cols-2 gap-4">
                {Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i}>
                      <div className="h-3 w-12 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
                      <div className="h-7 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShellNoPad>
  );
}
