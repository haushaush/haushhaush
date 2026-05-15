import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getParentRoute } from '@/lib/routeHierarchy';

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
  preferHistory?: boolean; // wenn true: Browser-Back versuchen, sonst direkter Link
}

export function BackButton({ href, label, className, preferHistory = true }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const resolved = href
    ? { parent: href, label: label ?? 'Zurück' }
    : getParentRoute(location.pathname) ?? { parent: '/', label: label ?? 'Zurück' };
  const displayLabel = label ?? resolved.label;

  const baseClasses = cn(
    'inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300',
    'hover:text-gray-900 dark:hover:text-white transition-colors',
    className,
  );

  const handleClick = (e: React.MouseEvent) => {
    if (!preferHistory) return;
    if (typeof window !== 'undefined' && window.history.length > 1) {
      e.preventDefault();
      navigate(-1);
    }
  };

  return (
    <Link to={resolved.parent} onClick={handleClick} className={baseClasses}>
      <ChevronLeft className="w-4 h-4" />
      {displayLabel}
    </Link>
  );
}

/** Smart variant: leitet Eltern-Route automatisch aus der Route-Hierarchie ab. */
export function SmartBackButton({ className }: { className?: string }) {
  const location = useLocation();
  const parent = getParentRoute(location.pathname);
  if (!parent) return null;
  return <BackButton href={parent.parent} label={parent.label} className={className} />;
}
