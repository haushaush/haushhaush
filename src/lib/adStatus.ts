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

/**
 * Robust active-check with fallback heuristic.
 * Falls effective_status fehlt (z. B. neu importiert, Sync läuft erst), nicht hart ausschließen:
 * Wenn die Anzeige in den letzten 7 Tagen synchronisiert wurde und Aktivität (impressions/leads/spend)
 * vorliegt, behandeln wir sie als aktiv.
 */
export function isAdActive(ad: any): { active: boolean; reason: string } {
  const status = (ad?.effective_status || ad?.status || ad?.meta_metrics?.effective_status || ad?.meta_metrics?.status || '')
    .toString()
    .toUpperCase();

  if (status === 'ACTIVE') return { active: true, reason: 'effective_status: ACTIVE' };
  if (status) return { active: false, reason: `Status: ${status}` };

  // Status fehlt → Heuristik
  if (ad?.last_synced_at) {
    const hoursOld = (Date.now() - new Date(ad.last_synced_at).getTime()) / 3600000;
    const m = ad?.meta_metrics ?? {};
    const hasRecentActivity =
      Number(m.impressions ?? 0) > 0 ||
      Number(m.leads ?? 0) > 0 ||
      Number(m.spend ?? 0) > 0;
    if (hoursOld < 168 && hasRecentActivity) {
      return { active: true, reason: 'Recent activity (last 7 days)' };
    }
  }
  return { active: false, reason: 'No status data' };
}
