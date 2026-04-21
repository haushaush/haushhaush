import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  formatCurrency,
  formatNumber,
  formatDecimal,
  formatPercent,
  entityStatusBadge,
  flatInsights,
} from './metaUtils';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ad: any | null;
  currency?: string;
  onStatusChanged?: (id: string, newStatus: string) => void;
}

export function MetaAdDetailPanel({ open, onOpenChange, ad, currency = 'EUR', onStatusChanged }: Props) {
  const { callMeta } = useMetaAds();
  const [updating, setUpdating] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  if (!ad) return null;
  const status = localStatus ?? ad.status;
  const ins = flatInsights(ad.insights);
  const badge = entityStatusBadge(status);
  const creative = ad.creative || {};
  const isActive = (status || '').toUpperCase() === 'ACTIVE';

  const handleToggle = async (next: boolean) => {
    const newStatus = next ? 'ACTIVE' : 'PAUSED';
    setUpdating(true);
    try {
      await callMeta(`/${ad.id}`, { status: newStatus }, 'POST');
      setLocalStatus(newStatus);
      onStatusChanged?.(ad.id, newStatus);
      toast.success(next ? 'Anzeige aktiviert' : 'Anzeige pausiert');
    } catch (e) {
      toast.error('Statusänderung fehlgeschlagen', { description: (e as Error).message });
    } finally {
      setUpdating(false);
    }
  };

  const metrics: { label: string; value: string }[] = [
    { label: 'Spend', value: formatCurrency(ins.spend, currency) },
    { label: 'Impressionen', value: formatNumber(ins.impressions) },
    { label: 'Klicks', value: formatNumber(ins.clicks) },
    { label: 'CTR', value: formatPercent(ins.ctr) },
    { label: 'CPC', value: formatCurrency(ins.cpc, currency) },
    { label: 'CPM', value: formatCurrency(ins.cpm, currency) },
    { label: 'Reichweite', value: formatNumber(ins.reach) },
    { label: 'Frequenz', value: formatDecimal(ins.frequency, 2) },
  ];

  const metaUrl = `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${ad.id}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-xl pr-8 leading-tight">{ad.name}</SheetTitle>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
            <a
              href={metaUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              In Meta öffnen <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4 pr-4 -mr-4">
          {creative.thumbnail_url && (
            <div className="rounded-lg border border-border bg-muted/30 mb-4 overflow-hidden">
              <img src={creative.thumbnail_url} alt="" className="w-full max-h-72 object-contain" />
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border border-border p-3 mb-4">
            <div>
              <p className="text-sm font-medium text-foreground">Anzeige aktiv</p>
              <p className="text-xs text-muted-foreground">Pausieren oder aktivieren über Meta API</p>
            </div>
            <div className="flex items-center gap-2">
              {updating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch checked={isActive} onCheckedChange={handleToggle} disabled={updating} />
            </div>
          </div>

          <section className="mb-5">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Metriken</h3>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-md border border-border p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-mono font-medium text-foreground mt-0.5">{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-5">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Creative</h3>
            <div className="space-y-2 text-sm">
              <DetailRow label="Headline" value={creative.title} />
              <DetailRow label="Body" value={creative.body} multiline />
              <DetailRow label="CTA" value={creative.call_to_action_type} />
              <DetailRow label="Creative ID" value={creative.id} mono />
            </div>
          </section>

          <section className="mb-5">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Info</h3>
            <div className="space-y-2 text-sm">
              <DetailRow label="Ad ID" value={ad.id} mono />
              <DetailRow label="Adset ID" value={ad.adset_id} mono />
              <DetailRow label="Campaign ID" value={ad.campaign_id} mono />
            </div>
          </section>

          <Button asChild variant="outline" className="w-full mb-6">
            <a href={metaUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              In Meta Ads Manager öffnen
            </a>
          </Button>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
  multiline,
  mono,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
  mono?: boolean;
}) {
  if (!value) {
    return (
      <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-border/50 pb-2">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-muted-foreground text-xs">–</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-border/50 pb-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`text-foreground ${mono ? 'font-mono text-xs' : 'text-sm'} ${
          multiline ? 'whitespace-pre-wrap' : 'break-all'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
