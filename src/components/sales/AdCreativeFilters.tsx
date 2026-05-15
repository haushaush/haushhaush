import { useEffect, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  Flame, UserCheck, Video, SlidersHorizontal, ChevronDown, X,
  Activity, Euro, Clock, Star, type LucideIcon,
} from "lucide-react";

export type AdFilters = {
  has_leads?: boolean;
  top_performers?: boolean;
  has_video?: boolean;
  is_active?: boolean;
  high_spend?: boolean;
  recent?: boolean;
  featured?: boolean;
  cpl_range?: [number, number];
  min_leads?: number;
  min_ctr?: number; // in percent (0-100)
  spend_range?: [number, number];
};

export const CPL_BOUNDS: [number, number] = [0, 100];
export const SPEND_BOUNDS: [number, number] = [0, 50000];

type ToggleColor = "gray" | "emerald" | "blue" | "purple" | "amber" | "yellow";

function QuickToggle({
  active, onClick, icon: Icon, label, color = "gray",
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  color?: ToggleColor;
}) {
  const activeMap: Record<ToggleColor, string> = {
    gray: "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white",
    emerald: "bg-emerald-500 text-white border-emerald-500",
    blue: "bg-blue-500 text-white border-blue-500",
    purple: "bg-purple-500 text-white border-purple-500",
    amber: "bg-amber-500 text-white border-amber-500",
    yellow: "bg-yellow-500 text-white border-yellow-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-full border transition-all ${
        active
          ? `${activeMap[color]} shadow-sm`
          : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function DualRangeSlider({
  min, max, step, value, onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  return (
    <SliderPrimitive.Root
      min={min}
      max={max}
      step={step}
      value={value}
      onValueChange={(v) => onChange([v[0], v[1]] as [number, number])}
      className="relative flex w-full touch-none select-none items-center h-5"
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <SliderPrimitive.Range className="absolute h-full bg-teal-500" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-teal-500 bg-white dark:bg-gray-950 shadow focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900" />
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-teal-500 bg-white dark:bg-gray-950 shadow focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-900" />
    </SliderPrimitive.Root>
  );
}

function RangeFilter({
  label, prefix = "", suffix = "", min, max, step, value, onChange, description,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  description?: string;
}) {
  const [local, setLocal] = useState<[number, number]>(value);
  useEffect(() => { setLocal(value); }, [value[0], value[1]]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local[0] !== value[0] || local[1] !== value[1]) onChange(local);
    }, 200);
    return () => clearTimeout(t);
  }, [local]);
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{label}</p>
          {description && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
        <span className="text-sm font-bold text-teal-600 dark:text-teal-400 tabular-nums whitespace-nowrap">
          {prefix}{local[0].toLocaleString("de-DE")}{suffix} – {prefix}{local[1].toLocaleString("de-DE")}{suffix}
        </span>
      </div>
      <DualRangeSlider min={min} max={max} step={step} value={local} onChange={setLocal} />
    </div>
  );
}

function NumberFilter({
  label, value, onChange, placeholder, suffix, description, step = 1, min = 0,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  description?: string;
  step?: number;
  min?: number;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-bold text-gray-900 dark:text-white">{label}</p>
        {description && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="relative">
        <input
          type="number"
          value={value ?? ""}
          min={min}
          step={step}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? undefined : Number(v));
          }}
          placeholder={placeholder}
          className="w-full px-3.5 py-2.5 pr-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 placeholder:font-normal focus:border-teal-400 focus:ring-1 focus:ring-teal-100 dark:focus:ring-teal-900 outline-none tabular-nums"
        />
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 dark:text-gray-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function AdCreativeFilters({
  filters, onChange,
}: {
  filters: AdFilters;
  onChange: (next: AdFilters) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = <K extends keyof AdFilters>(k: K, v: AdFilters[K] | undefined) => {
    const next = { ...filters };
    if (v === undefined || v === false || v === null) delete next[k];
    else (next as any)[k] = v;
    onChange(next);
  };

  const toggle = (k: keyof AdFilters) => {
    set(k as any, filters[k] ? undefined : (true as any));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <QuickToggle
          active={!!filters.has_leads}
          onClick={() => toggle("has_leads")}
          icon={UserCheck}
          label="Mit Leads"
        />
        <QuickToggle
          active={!!filters.top_performers}
          onClick={() => toggle("top_performers")}
          icon={Flame}
          label="Top-Performer"
          color="emerald"
        />
        <QuickToggle
          active={!!filters.has_video}
          onClick={() => toggle("has_video")}
          icon={Video}
          label="Nur Videos"
          color="purple"
        />

        <button
          type="button"
          onClick={() => setShowAdvanced(s => !s)}
          className={`ml-auto inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-full border transition-all ${
            showAdvanced
              ? "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800"
              : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Erweiterte Filter
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl">
          <RangeFilter
            label="CPL-Bereich"
            prefix="€"
            min={CPL_BOUNDS[0]}
            max={CPL_BOUNDS[1]}
            step={1}
            value={filters.cpl_range ?? CPL_BOUNDS}
            onChange={v => set("cpl_range", v)}
            description="Cost per Lead in Euro"
          />
          <RangeFilter
            label="Spend-Bereich"
            prefix="€"
            min={SPEND_BOUNDS[0]}
            max={SPEND_BOUNDS[1]}
            step={100}
            value={filters.spend_range ?? SPEND_BOUNDS}
            onChange={v => set("spend_range", v)}
            description="Gesamt-Werbebudget der Anzeige"
          />
          <NumberFilter
            label="Min. Leads"
            value={filters.min_leads}
            onChange={v => set("min_leads", v)}
            placeholder="z.B. 20"
            description="Anzeigen mit mindestens X Leads"
          />
          <NumberFilter
            label="Min. CTR"
            value={filters.min_ctr}
            onChange={v => set("min_ctr", v)}
            placeholder="z.B. 2"
            suffix="%"
            step={0.1}
            description="Click-Through-Rate Minimum"
          />
        </div>
      )}
    </div>
  );
}

export function ActiveFilterChips({
  search, dropdownFilters, dropdownLabels, adFilters,
  onRemoveSearch, onRemoveDropdown, onRemoveAdFilter, onResetAll,
}: {
  search: string;
  dropdownFilters: Record<string, string>;
  dropdownLabels: Record<string, { catLabel: string; optLabel: string }>;
  adFilters: AdFilters;
  onRemoveSearch: () => void;
  onRemoveDropdown: (key: string) => void;
  onRemoveAdFilter: (key: keyof AdFilters) => void;
  onResetAll: () => void;
}) {
  type Chip = { key: string; label: string; onRemove: () => void; tone: "gray" | "teal" | "emerald" | "purple" };
  const chips: Chip[] = [];

  if (search) chips.push({ key: "search", label: `"${search}"`, onRemove: onRemoveSearch, tone: "gray" });
  Object.entries(dropdownFilters).forEach(([k, v]) => {
    if (!v) return;
    const l = dropdownLabels[`${k}:${v}`];
    chips.push({
      key: `dd:${k}`,
      label: l ? `${l.catLabel}: ${l.optLabel}` : `${k}: ${v}`,
      onRemove: () => onRemoveDropdown(k),
      tone: "gray",
    });
  });
  if (adFilters.has_leads) chips.push({ key: "has_leads", label: "Mit Leads", onRemove: () => onRemoveAdFilter("has_leads"), tone: "gray" });
  if (adFilters.top_performers) chips.push({ key: "top_performers", label: "Top-Performer", onRemove: () => onRemoveAdFilter("top_performers"), tone: "emerald" });
  if (adFilters.has_video) chips.push({ key: "has_video", label: "Nur Videos", onRemove: () => onRemoveAdFilter("has_video"), tone: "purple" });
  if (adFilters.cpl_range) chips.push({ key: "cpl_range", label: `CPL €${adFilters.cpl_range[0]}–€${adFilters.cpl_range[1]}`, onRemove: () => onRemoveAdFilter("cpl_range"), tone: "teal" });
  if (adFilters.spend_range) chips.push({ key: "spend_range", label: `Spend €${adFilters.spend_range[0].toLocaleString("de-DE")}–€${adFilters.spend_range[1].toLocaleString("de-DE")}`, onRemove: () => onRemoveAdFilter("spend_range"), tone: "teal" });
  if (adFilters.min_leads != null) chips.push({ key: "min_leads", label: `Min. ${adFilters.min_leads} Leads`, onRemove: () => onRemoveAdFilter("min_leads"), tone: "teal" });
  if (adFilters.min_ctr != null) chips.push({ key: "min_ctr", label: `Min. CTR ${adFilters.min_ctr}%`, onRemove: () => onRemoveAdFilter("min_ctr"), tone: "teal" });

  if (chips.length === 0) return null;

  const toneMap = {
    gray: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700",
    teal: "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    emerald: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    purple: "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em]">
        Aktive Filter
      </span>
      {chips.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className={`inline-flex items-center gap-1.5 pl-3 pr-2 py-1 text-xs font-semibold rounded-full border transition-opacity hover:opacity-75 ${toneMap[c.tone]}`}
        >
          {c.label}
          <X className="w-3 h-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={onResetAll}
        className="ml-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline"
      >
        Alle zurücksetzen
      </button>
    </div>
  );
}

// Top performer thresholds per Branche (CPL ceiling)
export const TOP_CPL_THRESHOLDS: Record<string, number> = {
  PKV: 50,
  BU: 40,
  KFZ: 8,
  Tierkrankenversicherung: 12,
  Rechtsschutz: 15,
  default: 10,
};
