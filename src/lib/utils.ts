import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatValue(value: number | null | undefined, type: 'currency' | 'number' | 'percent', abbreviated = false): string {
  if (value === null || value === undefined || isNaN(value)) return '–';
  if (type === 'currency') {
    if (abbreviated) {
      if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
      if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K €`;
    }
    return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }
  if (type === 'number') {
    if (abbreviated) {
      if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toLocaleString('de-DE');
  }
  if (type === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  return String(value);
}
