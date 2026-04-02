import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatValue(value: number | null | undefined, type: 'currency' | 'number' | 'percent', abbreviated?: boolean): string {
  if (value === null || value === undefined || isNaN(value)) return '–';

  // Auto-detect: abbreviate only on mobile (<640px) unless explicitly set
  const shouldAbbreviate = abbreviated !== undefined ? abbreviated : (typeof window !== 'undefined' && window.innerWidth < 640);

  if (type === 'currency') {
    if (shouldAbbreviate) {
      if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
      if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K €`;
    }
    return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  }
  if (type === 'number') {
    if (shouldAbbreviate) {
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
