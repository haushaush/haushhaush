import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface IntegrationStatusBarProps {
  integrations: Array<{ provider: string; connected: boolean; category: string; last_sync_at?: string | null }>;
  onSyncAll: () => void;
  syncing: boolean;
}

const CATEGORIES = ['CRM', 'Marketing', 'Kommunikation', 'Finanzen', 'Automatisierung', 'Storage', 'Landing Pages'];

export function IntegrationStatusBar({ integrations, onSyncAll, syncing }: IntegrationStatusBarProps) {
  const totalProviders = 13;
  const connectedCount = integrations.filter(i => i.connected).length;
  const pct = Math.round((connectedCount / totalProviders) * 100);

  const categoryCounts: Record<string, { connected: number; total: number }> = {};
  const categoryTotals: Record<string, number> = {
    CRM: 1, Marketing: 2, Kommunikation: 3, Finanzen: 3, Automatisierung: 3, Storage: 1, 'Landing Pages': 2,
  };

  CATEGORIES.forEach(cat => {
    const connected = integrations.filter(i => i.category === cat && i.connected).length;
    categoryCounts[cat] = { connected, total: categoryTotals[cat] || 1 };
  });

  const lastSync = integrations
    .filter(i => i.last_sync_at)
    .sort((a, b) => new Date(b.last_sync_at!).getTime() - new Date(a.last_sync_at!).getTime())[0];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {connectedCount} von {totalProviders} Integrationen verbunden
          </p>
          <div className="mt-2 h-2 rounded-full bg-[var(--bg-app)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-teal)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSyncAll}
          disabled={syncing}
          className="flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          Alle synchronisieren
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => {
          const c = categoryCounts[cat];
          const allConnected = c.connected >= c.total;
          return (
            <Badge
              key={cat}
              variant="secondary"
              className={`text-[11px] font-medium ${
                allConnected
                  ? 'bg-[var(--color-green-subtle)] text-[var(--color-green-text)]'
                  : 'bg-[var(--bg-app)] text-[var(--text-secondary)]'
              }`}
            >
              {cat}: {c.connected}/{c.total} {allConnected && '✓'}
            </Badge>
          );
        })}
      </div>

      {lastSync?.last_sync_at && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Zuletzt synchronisiert: {new Date(lastSync.last_sync_at).toLocaleString('de-DE')}
        </p>
      )}
    </div>
  );
}
