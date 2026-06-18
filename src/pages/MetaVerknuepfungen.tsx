import { GitMerge } from 'lucide-react';
import { MetaMatchingCard } from '@/components/integrations/MetaMatchingCard';

export default function MetaVerknuepfungen() {
  return (
    <div className="container mx-auto p-6 space-y-8 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitMerge className="h-6 w-6 text-primary" />
          Verknüpfungen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Meta-Accounts mit Kunden cross-referenzieren
        </p>
      </div>

      <MetaMatchingCard />
    </div>
  );
}
