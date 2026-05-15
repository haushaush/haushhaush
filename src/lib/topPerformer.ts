/**
 * Top-Performer-Logik für Werbeanzeigen.
 * Drei harte Kriterien — ALLE müssen erfüllt sein:
 *   1. Spend > 100€
 *   2. CPL < 50€
 *   3. Leads > 50
 */
const num = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

export interface AdMetricsLike {
  meta_metrics?: Record<string, any> | null;
  metrics?: Record<string, any> | null;
  spend?: number | null;
  cpl?: number | null;
  leads?: number | null;
}

function pickMetrics(ad: AdMetricsLike) {
  const m = ad.meta_metrics ?? ad.metrics ?? {};
  return {
    spend: num((m as any).spend) ?? num(ad.spend),
    cpl: num((m as any).cpl) ?? num(ad.cpl),
    leads: num((m as any).leads) ?? num(ad.leads),
  };
}

export function isTopPerformer(ad: AdMetricsLike): boolean {
  const { spend, cpl, leads } = pickMetrics(ad);
  if (spend == null || spend <= 100) return false;
  if (cpl == null || cpl >= 50) return false;
  if (leads == null || leads <= 50) return false;
  return true;
}

export function getTopPerformerReason(ad: AdMetricsLike): string | null {
  if (!isTopPerformer(ad)) return null;
  const { spend, cpl, leads } = pickMetrics(ad);
  return `€${cpl!.toFixed(2)} CPL · ${leads} Leads · €${Math.round(spend!)} Budget`;
}

export function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t <= days * 86400_000;
}
