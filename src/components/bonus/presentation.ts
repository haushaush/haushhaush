export type Tier = { von?: number; bis?: number; ab?: number; unter?: number; ueber?: number; punkte: number };

// Mirrors tier lookup only for labelled forecasts; actual points always come from the server.
export function forecastPoints(tiers: Tier[], value: number) {
  const hit = tiers.find(t => (t.von === undefined || value >= t.von) && (t.bis === undefined || value <= t.bis) && (t.ab === undefined || value >= t.ab) && (t.unter === undefined || value < t.unter) && (t.ueber === undefined || value > t.ueber));
  return hit?.punkte ?? [...tiers].filter(t => (t.von ?? t.ab ?? t.ueber ?? -Infinity) <= value).sort((a, b) => (b.von ?? b.ab ?? b.ueber ?? -Infinity) - (a.von ?? a.ab ?? a.ueber ?? -Infinity))[0]?.punkte ?? 0;
}

export function boundaries(tiers: Tier[], precision = 0.01) {
  return tiers.map((t, i) => ({ value: t.von ?? t.ab ?? (t.ueber === undefined ? i > 0 && tiers[i - 1].bis !== undefined ? Number(tiers[i - 1].bis) + precision : 0 : t.ueber + precision), points: t.punkte }));
}

export function callProgress(weighted: number, target: number, points: number, tiers: Tier[], fullWeight = 1) {
  const coverage = target > 0 ? weighted / target * 100 : 0;
  const stages = boundaries(tiers).filter(t => t.value > 0);
  const next = stages.find(t => t.value > coverage && t.points > points);
  const remaining = next && target > 0 && fullWeight > 0 ? Math.max(0, Math.ceil((next.value / 100 * target - weighted - 1e-9) / fullWeight)) : null;
  return { coverage, stages, next, remaining };
}

export function monthClock(month: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => Number(parts.find(p => p.type === key)?.value);
  const [year, m] = month.split('-').map(Number);
  const days = new Date(year, m, 0).getDate();
  const current = year === part('year') && m === part('month');
  const future = year * 12 + m > part('year') * 12 + part('month');
  const day = current ? part('day') : future ? 0 : days;
  return { current, future, day, days, fraction: day / days };
}