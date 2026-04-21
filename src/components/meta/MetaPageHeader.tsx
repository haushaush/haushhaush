import { useMetaAds, DATE_PRESETS } from '@/contexts/MetaAdsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  showAccountSelector?: boolean;
  onExportCsv?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function MetaPageHeader({ title, subtitle, showAccountSelector = true, onExportCsv, onRefresh, refreshing }: Props) {
  const { accounts, loadingAccounts, selectedAccountId, setSelectedAccountId, datePreset, setDatePreset } = useMetaAds();

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showAccountSelector && (
            <Select
              value={selectedAccountId || ''}
              onValueChange={(v) => setSelectedAccountId(v)}
              disabled={loadingAccounts || accounts.length === 0}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={loadingAccounts ? 'Lade Konten…' : 'Werbekonto wählen'} />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} {a.currency ? `· ${a.currency}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onRefresh && (
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {onExportCsv && (
            <Button variant="outline" onClick={onExportCsv}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
