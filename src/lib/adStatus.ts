export type AdLiveStatus = 'live' | 'paused' | 'offline' | 'unknown';

export function getAdLiveStatus(ad: {
  effective_status?: string | null;
  status?: string | null;
  meta_metrics?: Record<string, any> | null;
}): AdLiveStatus {
  const eff = (ad.effective_status || ad.status || ad.meta_metrics?.effective_status || ad.meta_metrics?.status || '')
    .toString()
    .toUpperCase();
  if (!eff) return 'unknown';
  if (eff === 'ACTIVE') return 'live';
  if (eff === 'PAUSED') return 'paused';
  if (
    eff === 'DELETED' ||
    eff === 'ARCHIVED' ||
    eff === 'CAMPAIGN_PAUSED' ||
    eff === 'ADSET_PAUSED' ||
    eff === 'DISAPPROVED' ||
    eff === 'WITH_ISSUES'
  ) {
    return 'offline';
  }
  return 'unknown';
}
