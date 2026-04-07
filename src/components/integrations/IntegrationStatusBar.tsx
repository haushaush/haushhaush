import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface IntegrationStatusBarProps {
  integrations: Array<{
    provider: string;
    connected: boolean;
    category: string;
    healthScore?: number | null;
    hasError?: boolean;
  }>;
  onTestAll: () => void;
  testing: boolean;
}

const CAT_LABELS: Record<string, string> = {
  CRM: 'CRM',
  Marketing: 'Marketing',
  Kommunikation: 'Kommunikation',
  Finanzen: 'Finanzen',
  Automatisierung: 'Automatisierung',
  Storage: 'Storage',
  'Landing Pages': 'Landing Pages',
};

const CAT_TOTALS: Record<string, number> = {
  CRM: 1, Marketing: 2, Kommunikation: 3, Finanzen: 3, Automatisierung: 3, Storage: 1, 'Landing Pages': 2,
};

export function IntegrationStatusBar({ integrations, onTestAll, testing }: IntegrationStatusBarProps) {
  const connectedCount = integrations.filter(i => i.connected).length;
  const errorCount = integrations.filter(i => i.hasError).length;
  const total = integrations.length;

  const categoryCounts: Record<string, { connected: number; total: number }> = {};
  Object.keys(CAT_LABELS).forEach(cat => {
    const connected = integrations.filter(i => i.category === cat && i.connected).length;
    categoryCounts[cat] = { connected, total: CAT_TOTALS[cat] || 1 };
  });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Integrationen</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Verbinde externe Dienste mit dem Agency Hub</p>
        </div>
        <div className="flex items-center gap-3">
          {errorCount > 0 ? (
            <Badge className="bg-destructive/15 text-destructive border-destructive/30 border text-xs gap-1.5 px-3 py-1">
              <AlertCircle className="h-3 w-3" />
              {errorCount} Fehler
            </Badge>
          ) : connectedCount > 0 ? (
            <Badge className="bg-success/15 text-success border-success/30 border text-xs gap-1.5 px-3 py-1">
              🟢 {connectedCount}/{total} aktiv
            </Badge>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onTestAll}
            disabled={testing}
            className="text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${testing ? 'animate-spin' : ''}`} />
            Alle testen
          </Button>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(CAT_LABELS).map(([cat, label]) => {
          const c = categoryCounts[cat];
          if (!c) return null;
          const isConnected = c.connected > 0;
          return (
            <div
              key={cat}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                isConnected
                  ? 'border-primary/30 text-primary bg-primary/5'
                  : 'border-border text-muted-foreground bg-card'
              }`}
            >
              {label}: {c.connected}/{c.total}
              {c.connected >= c.total && ' ✓'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
