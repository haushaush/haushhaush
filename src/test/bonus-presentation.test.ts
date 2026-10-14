import { describe, expect, it } from 'vitest';
import { callProgress, forecastPoints, monthClock } from '@/components/bonus/presentation';

const tiers = [{ unter: 40, punkte: 0 }, { von: 40, bis: 59.9, punkte: 2.5 }, { von: 60, bis: 79.9, punkte: 5 }, { von: 80, bis: 99.9, punkte: 7.5 }, { ab: 100, punkte: 10 }];
describe('Bonus presentation without scoring changes', () => {
  it('shows five observed calls and 34 full-weight calls remaining at target 96', () => {
    const p = callProgress(5, 96, 0, tiers);
    expect(p.coverage).toBeCloseTo(5.20833);
    expect(p.next?.value).toBe(40);
    expect(p.remaining).toBe(34);
    expect(p.stages.map(s => s.value)).toEqual([40, 60, 80, 100]);
  });
  it('uses weighted performance and rounds required calls upwards', () => {
    expect(callProgress(38.4, 96, 2.5, tiers).remaining).toBe(20);
    expect(callProgress(96, 96, 10, tiers).next).toBeUndefined();
    expect(callProgress(0, 0, 0, tiers).remaining).toBeNull();
  });
  it('identifies running and closed months in Berlin time', () => {
    const c = monthClock('2026-10-01', new Date('2026-10-14T08:00:00Z'));
    expect(c.day).toBe(14); expect(c.days).toBe(31);
    expect(Math.round(96 * c.fraction)).toBe(43);
    expect(Math.round(5 / c.fraction)).toBe(11);
    expect(monthClock('2026-09-01', new Date('2026-10-14')).current).toBe(false);
  });
  it('forecasts with the existing tier behavior, including gaps', () => {
    expect(forecastPoints(tiers, 11.5327)).toBe(0);
    expect(forecastPoints(tiers, 40)).toBe(2.5);
    expect(forecastPoints(tiers, 59.95)).toBe(2.5);
  });
});