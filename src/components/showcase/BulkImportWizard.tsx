import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  X, Check, Facebook, Calendar, Activity, Filter, Flame, Loader2,
  Download, Search as SearchIcon, Sparkles, Zap, Wand2, HelpCircle,
} from 'lucide-react';
import { Combobox } from '@/components/ui/Combobox';
import { useBranchen, useUnternehmen } from '@/hooks/useBranchenUnternehmen';
import { useKundenMapping, guessBrancheFromText, type KundeMatch } from '@/hooks/useKundenMapping';

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────
type Step = 'source' | 'filter' | 'select' | 'enrich' | 'import' | 'done';

interface ImportableAd {
  meta_ad_id: string;
  meta_ad_name: string;
  meta_account_id: string;
  meta_account_name?: string;
  meta_campaign_name?: string;
  status?: string;
  ad_format?: string;
  thumbnail_url?: string | null;
  metrics?: { leads?: number; cpl?: number | null; spend?: number; roas?: number | null; ctr?: number | null } | null;
  already_imported?: boolean;
}

interface Enrichment {
  branche?: string;
  unternehmen?: string;
}

interface FilterState {
  datePreset: 'last_30d' | 'last_90d' | 'last_180d' | 'maximum';
  status: 'ACTIVE' | 'PAUSED' | 'ALL';
  minLeads: number;
  minSpend: number;
}

interface ProgressEntry {
  adId: string;
  adName: string;
  status: 'pending' | 'success' | 'error';
  message: string;
}

interface ImportProgress {
  done: number;
  total: number;
  recent: ProgressEntry[];
  errors: { adId: string; adName: string; message: string }[];
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'source', label: 'Quelle' },
  { key: 'filter', label: 'Filter' },
  { key: 'select', label: 'Auswahl' },
  { key: 'enrich', label: 'Anreichern' },
  { key: 'import', label: 'Import' },
];

const DATE_PRESETS = [
  { value: 'last_30d', label: 'Letzte 30 Tage' },
  { value: 'last_90d', label: 'Letzte 90 Tage' },
  { value: 'last_180d', label: 'Letzte 6 Monate' },
  { value: 'maximum', label: 'Gesamt' },
] as const;

export function BulkImportWizard({ open, onClose, onImported }: Props) {
  const { accounts, loadingAccounts } = useMetaAds();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('source');
  const [accountId, setAccountId] = useState<string>('');
  const [filters, setFilters] = useState<FilterState>({
    datePreset: 'last_90d',
    status: 'ACTIVE',
    minLeads: 0,
    minSpend: 0,
  });

  const [ads, setAds] = useState<ImportableAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrichment, setEnrichment] = useState<Record<string, Enrichment>>({});
  const [bulkBranche, setBulkBranche] = useState('');
  const [bulkUnternehmen, setBulkUnternehmen] = useState('');

  const [progress, setProgress] = useState<ImportProgress>({
    done: 0, total: 0, recent: [], errors: [],
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('source');
      setSelected(new Set());
      setEnrichment({});
      setProgress({ done: 0, total: 0, recent: [], errors: [] });
      if (!accountId && accounts[0]) setAccountId(accounts[0].id);
    }
  }, [open, accounts]);

  // Lookups for enrichment dropdowns (close_deals)
  const [brancheOpts, setBrancheOpts] = useState<string[]>([]);
  const [unternehmenOpts, setUnternehmenOpts] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('close_deals' as any)
        .select('branche, unternehmen')
        .limit(2000);
      const b = new Set<string>();
      const u = new Set<string>();
      ((data ?? []) as any[]).forEach(r => {
        const br = typeof r.branche === 'string' ? r.branche.trim() : '';
        const un = typeof r.unternehmen === 'string' ? r.unternehmen.trim() : '';
        if (br) b.add(br);
        if (un) u.add(un);
      });
      setBrancheOpts([...b].sort((a, b) => a.localeCompare(b, 'de')));
      setUnternehmenOpts([...u].sort((a, b) => a.localeCompare(b, 'de')));
    })();
  }, [open]);

  const fetchAds = async () => {
    if (!accountId) return;
    setAdsLoading(true);
    try {
      const all: ImportableAd[] = [];
      let after: string | undefined;
      // fetch up to ~200 ads (8 pages × 25)
      for (let i = 0; i < 8; i++) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error('Nicht eingeloggt – bitte erneut anmelden.');
        const { data, error } = await supabase.functions.invoke('meta-ads-list-importable', {
          body: {
            accountId,
            status: filters.status,
            limit: 25,
            after,
            datePreset: filters.datePreset,
          },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (error) throw error;
        const page = (data as any)?.ads as ImportableAd[] | undefined;
        if (!page || page.length === 0) break;
        all.push(...page);
        after = (data as any)?.paging?.cursors?.after;
        if (!after) break;
      }
      // Apply min thresholds locally
      const filtered = all.filter(a => {
        const m = a.metrics ?? {};
        if (filters.minLeads > 0 && (m.leads ?? 0) < filters.minLeads) return false;
        if (filters.minSpend > 0 && (m.spend ?? 0) < filters.minSpend) return false;
        return true;
      });
      setAds(filtered);
    } catch (e) {
      toast({ title: 'Fehler beim Laden', description: (e as Error).message, variant: 'destructive' });
      setAds([]);
    } finally {
      setAdsLoading(false);
    }
  };

  const isTopPerformer = (a: ImportableAd) => {
    const m = a.metrics ?? {};
    const cpl = m.cpl ?? null;
    const leads = m.leads ?? 0;
    const ctr = m.ctr ?? null;
    return (cpl != null && cpl < 25) || leads >= 20 || (ctr != null && ctr > 3);
  };

  const handleNext = async () => {
    if (step === 'source' && accountId) {
      setStep('filter');
    } else if (step === 'filter') {
      setStep('select');
      await fetchAds();
    } else if (step === 'select' && selected.size > 0) {
      setStep('enrich');
    } else if (step === 'enrich') {
      await runImport();
    }
  };

  const handleBack = () => {
    const order: Step[] = ['source', 'filter', 'select', 'enrich'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  const runImport = async () => {
    setStep('import');
    const ids = Array.from(selected);
    setProgress({ done: 0, total: ids.length, recent: [], errors: [] });

    for (let i = 0; i < ids.length; i++) {
      const adId = ids[i];
      const ad = ads.find(a => a.meta_ad_id === adId);
      const adName = ad?.meta_ad_name ?? adId;

      setProgress(prev => ({
        ...prev,
        recent: [{ adId, adName, status: 'pending' as const, message: `Importiere "${adName}"...` }, ...prev.recent].slice(0, 20),
      }));

      try {
        const { data: sess2 } = await supabase.auth.getSession();
        const token2 = sess2.session?.access_token;
        if (!token2) throw new Error('Nicht eingeloggt – bitte erneut anmelden.');
        const { data, error } = await supabase.functions.invoke('meta-ads-import-to-showcase', {
          body: { adIds: [adId] },
          headers: { Authorization: `Bearer ${token2}` },
        });
        if (error) throw error;
        const res = data as any;
        if (res?.errors?.length) {
          throw new Error(res.errors[0]?.error || 'Unbekannter Fehler');
        }

        // Apply per-ad enrichment overrides
        const enr = enrichment[adId];
        if (enr && (enr.branche || enr.unternehmen)) {
          const update: Record<string, any> = {};
          if (enr.branche) update.custom_branche = enr.branche;
          if (enr.unternehmen) update.custom_unternehmen = enr.unternehmen;
          await supabase.from('referenz_meta_ads' as any)
            .update(update)
            .eq('meta_ad_id', adId);
        }

        setProgress(prev => ({
          ...prev,
          done: prev.done + 1,
          recent: [{ adId, adName, status: 'success' as const, message: `✓ ${adName}` }, ...prev.recent].slice(0, 20),
        }));
      } catch (e) {
        const msg = (e as Error).message;
        setProgress(prev => ({
          ...prev,
          done: prev.done + 1,
          errors: [...prev.errors, { adId, adName, message: msg }],
          recent: [{ adId, adName, status: 'error' as const, message: `✗ ${adName}: ${msg}` }, ...prev.recent].slice(0, 20),
        }));
      }
    }

    setStep('done');
    onImported();
  };

  const applyBulk = () => {
    const update: Record<string, Enrichment> = { ...enrichment };
    selected.forEach(id => {
      update[id] = {
        branche: bulkBranche || update[id]?.branche,
        unternehmen: bulkUnternehmen || update[id]?.unternehmen,
      };
    });
    setEnrichment(update);
    toast({ title: 'Übernommen', description: `Auf ${selected.size} Anzeigen angewendet.` });
  };

  const subtitle = useMemo(() => {
    switch (step) {
      case 'source': return 'Wähle das Werbekonto';
      case 'filter': return 'Filter setzen, um relevante Anzeigen zu finden';
      case 'select': return `${selected.size} von ${ads.length} ausgewählt`;
      case 'enrich': return 'Branche und Unternehmen zuordnen';
      case 'import': return 'Wird importiert...';
      case 'done': return 'Fertig';
    }
  }, [step, selected.size, ads.length]);

  const canCloseRequest = step !== 'import';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && canCloseRequest) onClose(); }}>
      <DialogContent persistent className="max-w-6xl h-[88vh] flex flex-col p-0 overflow-hidden gap-0">
        {/* HEADER */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Anzeigen aus Meta importieren
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          {canCloseRequest && (
            <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* STEPPER */}
        <StepperBar currentStep={step} />

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 'source' && (
            <SourceStep
              accounts={accounts}
              loading={loadingAccounts}
              selectedAccount={accountId}
              onChange={setAccountId}
            />
          )}
          {step === 'filter' && <FilterStep filters={filters} onChange={setFilters} />}
          {step === 'select' && (
            <SelectStep
              ads={ads}
              loading={adsLoading}
              selectedIds={selected}
              onChange={setSelected}
              isTop={isTopPerformer}
            />
          )}
          {step === 'enrich' && (
            <EnrichStep
              ads={ads.filter(a => selected.has(a.meta_ad_id))}
              enrichment={enrichment}
              onEnrichmentChange={setEnrichment}
              brancheOpts={brancheOpts}
              unternehmenOpts={unternehmenOpts}
              bulkBranche={bulkBranche}
              setBulkBranche={setBulkBranche}
              bulkUnternehmen={bulkUnternehmen}
              setBulkUnternehmen={setBulkUnternehmen}
              onApplyBulk={applyBulk}
            />
          )}
          {step === 'import' && <ImportStep progress={progress} />}
          {step === 'done' && <DoneStep progress={progress} onClose={onClose} />}
        </div>

        {/* FOOTER */}
        {step !== 'import' && step !== 'done' && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50 dark:bg-gray-900/50">
            <Button variant="ghost" onClick={handleBack} disabled={step === 'source'}>
              Zurück
            </Button>
            <Button
              variant="accent"
              onClick={handleNext}
              disabled={
                (step === 'source' && !accountId) ||
                (step === 'select' && selected.size === 0) ||
                adsLoading
              }
            >
              {step === 'enrich' ? `${selected.size} importieren →` : 'Weiter →'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────
// Stepper
// ───────────────────────────────────────────────────────────────────
function StepperBar({ currentStep }: { currentStep: Step }) {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);
  const isDoneAll = currentStep === 'done';

  return (
    <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 shrink-0">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = i === currentIdx && !isDoneAll;
          const isDone = i < currentIdx || isDoneAll;
          return (
            <Fragment key={s.key}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                  isActive && 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 scale-110',
                  isDone && 'bg-emerald-500 text-white',
                  !isActive && !isDone && 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500',
                )}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn(
                  'text-sm font-semibold transition-colors hidden md:inline',
                  isActive && 'text-gray-900 dark:text-white',
                  isDone && 'text-emerald-600 dark:text-emerald-400',
                  !isActive && !isDone && 'text-gray-400 dark:text-gray-500',
                )}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 rounded-full transition-colors',
                  i < currentIdx || isDoneAll ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-800',
                )} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Step: Source
// ───────────────────────────────────────────────────────────────────
function SourceStep({ accounts, loading, selectedAccount, onChange }: {
  accounts: any[]; loading: boolean; selectedAccount: string; onChange: (id: string) => void;
}) {
  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (accounts.length === 0) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <Facebook className="w-6 h-6 text-gray-400" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Kein Meta-Account verbunden</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Verbinde zuerst dein Meta-Werbekonto unter Connections.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Aus welchem Werbekonto sollen Anzeigen importiert werden?
      </p>
      {accounts.map(acc => (
        <button
          key={acc.id}
          onClick={() => onChange(acc.id)}
          className={cn(
            'w-full p-4 rounded-xl border text-left transition-all flex items-center gap-4',
            selectedAccount === acc.id
              ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800 ring-2 ring-gray-900/10 dark:ring-white/10'
              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900',
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0">
            <Facebook className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 dark:text-white truncate">{acc.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {acc.account_id ?? acc.id}{acc.currency ? ` · ${acc.currency}` : ''}
            </div>
          </div>
          {selectedAccount === acc.id && <Check className="w-5 h-5 text-gray-900 dark:text-white shrink-0" />}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Step: Filter
// ───────────────────────────────────────────────────────────────────
function FilterStep({ filters, onChange }: { filters: FilterState; onChange: (f: FilterState) => void }) {
  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Setze Filter, um aus tausenden Anzeigen die relevanten zu finden.
      </p>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Zeitraum</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => onChange({ ...filters, datePreset: p.value })}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all',
                filters.datePreset === p.value
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Status</h4>
        </div>
        <div className="space-y-2">
          {[
            { v: 'ACTIVE', l: 'Nur aktive Anzeigen', d: 'Aktuell laufend' },
            { v: 'PAUSED', l: 'Pausierte', d: 'Manuell gestoppt' },
            { v: 'ALL', l: 'Alle Anzeigen', d: 'Aktive + pausierte + beendete' },
          ].map(o => (
            <button
              key={o.v}
              onClick={() => onChange({ ...filters, status: o.v as any })}
              className={cn(
                'w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3',
                filters.status === o.v
                  ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700',
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center',
                filters.status === o.v ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600',
              )}>
                {filters.status === o.v && <div className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white" />}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{o.l}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{o.d}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Performance-Filter</h4>
          <span className="text-xs text-gray-400 ml-1">optional</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Nur Anzeigen einbeziehen, die Mindestwerte erreichen.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Min. Leads</label>
            <input
              type="number"
              min={0}
              value={filters.minLeads || ''}
              onChange={e => onChange({ ...filters, minLeads: Number(e.target.value) || 0 })}
              placeholder="z.B. 5"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm tabular-nums focus:border-gray-400 dark:focus:border-gray-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Min. Budget (€)</label>
            <input
              type="number"
              min={0}
              value={filters.minSpend || ''}
              onChange={e => onChange({ ...filters, minSpend: Number(e.target.value) || 0 })}
              placeholder="z.B. 100"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm tabular-nums focus:border-gray-400 dark:focus:border-gray-500 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Step: Select
// ───────────────────────────────────────────────────────────────────
function SelectStep({ ads, loading, selectedIds, onChange, isTop }: {
  ads: ImportableAd[];
  loading: boolean;
  selectedIds: Set<string>;
  onChange: (s: Set<string>) => void;
  isTop: (a: ImportableAd) => boolean;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return ads;
    const q = search.toLowerCase();
    return ads.filter(a =>
      a.meta_ad_name?.toLowerCase().includes(q) ||
      a.meta_campaign_name?.toLowerCase().includes(q));
  }, [ads, search]);

  const toggle = (id: string) => {
    const n = new Set(selectedIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    onChange(n);
  };

  const selectableAds = filtered.filter(a => !a.already_imported);
  const selectAll = () => onChange(new Set(selectableAds.map(a => a.meta_ad_id)));
  const selectNone = () => onChange(new Set());
  const selectTop = () => onChange(new Set(selectableAds.filter(isTop).map(a => a.meta_ad_id)));

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500">Lade Anzeigen aus Meta...</p>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <SearchIcon className="w-6 h-6 text-gray-400" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Keine Anzeigen gefunden</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Lockere die Filter im vorigen Schritt.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 sticky top-0 bg-white dark:bg-gray-950 pb-3 -mx-6 px-6 z-10 border-b border-gray-100 dark:border-gray-900">
        <div className="flex items-center gap-2 flex-1">
          <button onClick={selectAll} className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline">
            Alle ({selectableAds.length})
          </button>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <button onClick={selectTop} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
            <Flame className="w-3 h-3" /> Top-Performer
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <button onClick={selectNone} className="text-xs font-semibold text-gray-500 hover:underline">Keine</button>
            </>
          )}
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 outline-none focus:border-gray-400 w-44"
          />
        </div>
        <div className="text-sm font-bold text-gray-900 dark:text-white shrink-0">
          <span className="tabular-nums">{selectedIds.size}</span>
          <span className="text-gray-400 dark:text-gray-500"> / {ads.length} ausgewählt</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map(ad => (
          <SelectableAdCard
            key={ad.meta_ad_id}
            ad={ad}
            selected={selectedIds.has(ad.meta_ad_id)}
            onToggle={() => toggle(ad.meta_ad_id)}
          />
        ))}
      </div>
    </div>
  );
}

function SelectableAdCard({ ad, selected, onToggle }: {
  ad: ImportableAd; selected: boolean; onToggle: () => void;
}) {
  const m = ad.metrics ?? {};
  const disabled = ad.already_imported;
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={cn(
        'relative rounded-xl overflow-hidden border-2 transition-all text-left bg-white dark:bg-gray-900',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && selected && 'border-gray-900 dark:border-white ring-2 ring-gray-900/15 dark:ring-white/15',
        !disabled && !selected && 'border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600',
      )}
    >
      <div className="aspect-square bg-gray-100 dark:bg-gray-800 relative">
        {ad.thumbnail_url ? (
          <img src={ad.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <SearchIcon className="w-6 h-6" />
          </div>
        )}
        <div className={cn(
          'absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all',
          selected ? 'bg-gray-900 dark:bg-white' : 'bg-white/85 dark:bg-gray-900/85 border border-gray-300 dark:border-gray-600',
        )}>
          {selected && <Check className="w-3.5 h-3.5 text-white dark:text-gray-900" />}
        </div>
        {disabled && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500/90 text-[9px] font-bold text-white">
            Bereits importiert
          </div>
        )}
        {(m.cpl != null || m.leads != null) && !disabled && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-6">
            <div className="flex items-center justify-between text-[10px] font-bold text-white tabular-nums">
              {m.cpl != null && <span>€{m.cpl.toFixed(2)} CPL</span>}
              {m.leads != null && m.leads > 0 && <span>{m.leads} Leads</span>}
            </div>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{ad.meta_ad_name}</p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{ad.meta_campaign_name ?? '—'}</p>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────
// Step: Enrich
// ───────────────────────────────────────────────────────────────────
function EnrichStep({
  ads, enrichment, onEnrichmentChange, brancheOpts, unternehmenOpts,
  bulkBranche, setBulkBranche, bulkUnternehmen, setBulkUnternehmen, onApplyBulk,
}: {
  ads: ImportableAd[];
  enrichment: Record<string, Enrichment>;
  onEnrichmentChange: (e: Record<string, Enrichment>) => void;
  brancheOpts: string[];
  unternehmenOpts: string[];
  bulkBranche: string;
  setBulkBranche: (v: string) => void;
  bulkUnternehmen: string;
  setBulkUnternehmen: (v: string) => void;
  onApplyBulk: () => void;
}) {
  const setOne = (id: string, patch: Enrichment) => {
    onEnrichmentChange({ ...enrichment, [id]: { ...enrichment[id], ...patch } });
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            Auf alle anwenden
          </span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Setze diese Werte für alle {ads.length} Anzeigen auf einmal. Optional — der Server versucht automatisch zu matchen.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SelectField label="Branche" value={bulkBranche} onChange={setBulkBranche} options={brancheOpts} />
          <SelectField label="Unternehmen" value={bulkUnternehmen} onChange={setBulkUnternehmen} options={unternehmenOpts} />
          <div className="flex items-end">
            <Button
              variant="default"
              onClick={onApplyBulk}
              disabled={!bulkBranche && !bulkUnternehmen}
              className="w-full"
            >
              Übernehmen
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Pro Anzeige anpassen</h4>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[420px] overflow-y-auto">
          {ads.map(ad => {
            const enr = enrichment[ad.meta_ad_id] ?? {};
            return (
              <div key={ad.meta_ad_id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0">
                  {ad.thumbnail_url ? <img src={ad.thumbnail_url} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ad.meta_ad_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{ad.meta_campaign_name ?? '—'}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <SelectField
                    value={enr.branche ?? ''}
                    onChange={v => setOne(ad.meta_ad_id, { branche: v })}
                    options={brancheOpts}
                    placeholder="Branche"
                    compact
                  />
                  <SelectField
                    value={enr.unternehmen ?? ''}
                    onChange={v => setOne(ad.meta_ad_id, { unternehmen: v })}
                    options={unternehmenOpts}
                    placeholder="Unternehmen"
                    compact
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder, compact }: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:border-gray-400',
          compact ? 'h-8 px-2 text-xs w-32' : 'w-full px-3 py-2',
        )}
      >
        <option value="">{placeholder ?? '—'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Step: Import (live progress)
// ───────────────────────────────────────────────────────────────────
function ImportStep({ progress }: { progress: ImportProgress }) {
  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className="max-w-md mx-auto py-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center mb-4 shadow-lg">
          <Download className="w-8 h-8 text-white animate-bounce" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
          Importiere {progress.total} Anzeigen
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          {progress.done} von {progress.total} fertig
        </p>
      </div>
      <div className="mb-6">
        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">{Math.round(percent)}%</span>
          {progress.errors.length > 0 && (
            <span className="text-red-600 dark:text-red-400 font-bold">
              {progress.errors.length} Fehler
            </span>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 max-h-48 overflow-y-auto">
        <div className="space-y-1.5 text-xs font-mono">
          {progress.recent.length === 0 && (
            <div className="text-gray-400 italic">Warte auf erste Aktion...</div>
          )}
          {progress.recent.map((entry, i) => (
            <div key={i} className={cn(
              'flex items-center gap-2',
              entry.status === 'success' && 'text-emerald-600 dark:text-emerald-400',
              entry.status === 'error' && 'text-red-600 dark:text-red-400',
              entry.status === 'pending' && 'text-gray-500 dark:text-gray-400',
            )}>
              {entry.status === 'success' && <Check className="w-3 h-3 shrink-0" />}
              {entry.status === 'error' && <X className="w-3 h-3 shrink-0" />}
              {entry.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
              <span className="truncate">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Step: Done
// ───────────────────────────────────────────────────────────────────
function DoneStep({ progress, onClose }: { progress: ImportProgress; onClose: () => void }) {
  const success = progress.total - progress.errors.length;
  return (
    <div className="max-w-md mx-auto py-8 text-center">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
        <Check className="w-10 h-10 text-white stroke-[3]" />
      </div>
      <h3 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2 tabular-nums">
        {success} Anzeigen importiert
      </h3>
      {progress.errors.length > 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-6">
          {progress.errors.length} konnten nicht importiert werden. Details unten.
        </p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Alle Anzeigen wurden erfolgreich importiert.
        </p>
      )}
      {progress.errors.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-left mb-6 max-h-48 overflow-y-auto">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Fehler-Details
          </p>
          <div className="space-y-1.5 text-xs">
            {progress.errors.map((err, i) => (
              <div key={i} className="text-red-600 dark:text-red-400">
                <strong className="font-bold">{err.adName}:</strong> {err.message}
              </div>
            ))}
          </div>
        </div>
      )}
      <Button variant="accent" size="lg" onClick={onClose} className="w-full">
        Zum Showcase →
      </Button>
    </div>
  );
}
