import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

interface DraftIndicatorProps {
  trigger?: unknown;
}

export function DraftIndicator({ trigger }: DraftIndicatorProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 1500);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!show) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-opacity">
      <Check className="w-3 h-3" />
      Entwurf gespeichert
    </span>
  );
}
