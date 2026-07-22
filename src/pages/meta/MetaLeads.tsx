import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { MetaAccountSelector } from '@/components/meta/MetaAccountSelector';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Download, RotateCcw, Play } from 'lucide-react';
import { toast } from 'sonner';

type Preset = 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'last_7_days', label: 'Letzte 7 Tage' },
  { value: 'last_30_days', label: 'Letzte 30 Tage' },
  { value: 'this_month', label: 'Dieser Monat' },
  { value: 'last_month', label: 'Letzter Monat' },
  { value: 'all_time', label: 'Insgesamt' },
  { value: 'custom', label: 'Benutzerdefiniert' },
];

interface Lead {
  lead_id: string;
  created_time: string;
  form_id: string;
  form_name: string;
  campaign_name: string;
  ad_name: string;
  meta_account_id: string;
  meta_account_name: string;
  fields: Record<string, string>;
  raw: any;
}

interface Result {
  meta_account_id: string;
  meta_account_name: string;
  period: { from: string | null; to: string | null; preset: Preset };
  leads: Lead[];
  truncated?: boolean;
  warning?: string;
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(leads: Lead[]): string {
  const baseCols = [
    'created_time', 'meta_account_id', 'meta_account_name',
    'form_id', 'form_name', 'lead_id', 'campaign_name', 'ad_name',
    'full_name', 'email', 'phone', 'city', 'zip',
  ];
  const dynamic = new Set<string>();
  for (const l of leads) {
    for (const k of Object.keys(l.fields || {})) {
      if (!['full_name', 'email', 'phone', 'city', 'zip'].includes(k)) dynamic.add(k);
    }
  }
  const dynamicCols = Array.from(dynamic).sort();
  const cols = [...baseCols, ...dynamicCols];
  const header = cols.join(',');
  const rows = leads.map((l) => cols.map((c) => {
    switch (c) {
      case 'created_time': return csvEscape(l.created_time);
      case 'meta_account_id': return csvEscape(l.meta_account_id);
      case 'meta_account_name': return csvEscape(l.meta_account_name);
      case 'form_id': return csvEscape(l.form_id);
      case 'form_name': return csvEscape(l.form_name);
      case 'lead_id': return csvEscape(l.lead_id);
      case 'campaign_name': return csvEscape(l.campaign_name);
      case 'ad_name': return csvEscape(l.ad_name);
      default: return csvEscape(l.fields?.[c] ?? '');
    }
  }).join(','));
  return [header, ...rows].join('\n');
}

export default function MetaLeads() {
  const { accounts, selectedAccountId } = useMetaAds();
  const [preset, setPreset] = useState<Preset>('last_7_days');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = accounts.find((a) => a.id === selectedAccountId);

  const dynamicFieldKeys = useMemo(() => {
    if (!result) return [] as string[];
    const s = new Set<string>();
    for (const l of result.leads) {
      for (const k of Object.keys(l.fields || {})) {
        if (!['full_name', 'email', 'phone', 'city', 'zip'].includes(k)) s.add(k);
      }
    }
    return Array.from(s).sort();
  }, [result]);

  const loadLeads = async () => {
    if (loading) return;
    if (!selectedAccountId) { toast.error('Bitte Werbekonto wählen'); return; }
    if (preset === 'custom' && (!dateFrom || !dateTo)) { toast.error('Bitte Zeitraum wählen'); return; }
    if (preset === 'all_time') {
      const ok = window.confirm('Dieser Export kann viele Meta API Calls verursachen. Fortfahren?');
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('export-meta-leads', {
        body: {
          meta_account_id: selectedAccountId,
          date_preset: preset,
          date_from: preset === 'custom' ? dateFrom : undefined,
          date_to: preset === 'custom' ? dateTo : undefined,
          confirm_all_time: preset === 'all_time',
        },
      });

      // Rate limit comes back as JSON body even on non-2xx via FunctionsHttpError
      let payload: any = data;
      if (err) {
        const ctx: any = (err as any).context;
        try {
          const bodyText = ctx && typeof ctx.text === 'function' ? await ctx.text() : null;
          if (bodyText) payload = JSON.parse(bodyText);
        } catch { /* ignore */ }
        if (!payload) throw new Error(err.message);
      }

      if (payload?.error === 'meta_rate_limit') {
        setError('Meta API Limit erreicht. Bitte warte ein paar Minuten und versuche es erneut.');
        toast.error('Meta API Limit erreicht');
        return; // keep previously loaded result
      }
      if (payload?.success === false && payload?.error && payload.error !== 'confirm_required') {
        throw new Error(payload.message || payload.error);
      }
      if (payload?.error && !payload?.success) throw new Error(payload.error);

      setResult(payload as Result);
      if (payload?.warning) toast.info(payload.warning);
      else toast.success(`${payload.count} Leads geladen`);
    } catch (e) {
      const msg = (e as Error).message || 'Unbekannter Fehler';
      setError(msg);
      toast.error('Leads konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!result || result.leads.length === 0) return;
    const csv = toCsv(result.leads);
    const safeName = (result.meta_account_name || result.meta_account_id).replace(/[^\w.-]+/g, '_');
    const from = result.period.from || 'all';
    const to = result.period.to || 'all';
    const filename = `meta-leads-${safeName}-${from}-${to}.csv`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setPreset('last_7_days');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Meta Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exportiere Leads aus Meta Lead Ads nach Werbekonto und Zeitraum.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Werbekonto</label>
            <MetaAccountSelector width="w-[320px]" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Zeitraum</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Von</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bis</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
              </div>
            </>
          )}
          <Button onClick={loadLeads} disabled={loading || !selectedAccountId}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Leads laden
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!result || result.leads.length === 0}>
            <Download className="h-4 w-4 mr-2" /> CSV exportieren
          </Button>
          <Button variant="ghost" onClick={reset} disabled={loading}>
            <RotateCcw className="h-4 w-4 mr-2" /> Zurücksetzen
          </Button>
        </div>
        {selected && (
          <p className="text-xs text-muted-foreground mt-3">
            Ausgewählt: <span className="font-mono">{selected.name} – {selected.id}</span>
          </p>
        )}
      </div>

      {loading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Leads werden geladen …
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 mb-6">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Meta hat die Anfrage möglicherweise wegen zu vieler API-Aufrufe gedrosselt.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadLeads} disabled={loading}>
            Erneut versuchen
          </Button>
        </div>
      )}

      {!loading && !error && result && result.leads.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          {result.warning || 'Keine Leads für diesen Zeitraum gefunden.'}
        </div>
      )}

      {!loading && !error && result && result.leads.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">{result.leads.length}</span> Leads
              {result.truncated && <span className="text-amber-600 ml-2">· Ergebnis gekürzt</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {result.period.from || '—'} bis {result.period.to || '—'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Erstellt</th>
                  <th className="text-left px-3 py-2 font-medium">Werbekonto</th>
                  <th className="text-left px-3 py-2 font-medium">Formular</th>
                  <th className="text-left px-3 py-2 font-medium">Kampagne</th>
                  <th className="text-left px-3 py-2 font-medium">Anzeige</th>
                  <th className="text-left px-3 py-2 font-medium">Lead ID</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">E-Mail</th>
                  <th className="text-left px-3 py-2 font-medium">Telefon</th>
                  <th className="text-left px-3 py-2 font-medium">PLZ</th>
                  <th className="text-left px-3 py-2 font-medium">Stadt</th>
                  {dynamicFieldKeys.map((k) => (
                    <th key={k} className="text-left px-3 py-2 font-medium">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.leads.map((l) => (
                  <tr key={l.lead_id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {l.created_time ? new Date(l.created_time).toLocaleString('de-DE') : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{l.meta_account_name}</td>
                    <td className="px-3 py-2">{l.form_name}</td>
                    <td className="px-3 py-2">{l.campaign_name || '—'}</td>
                    <td className="px-3 py-2">{l.ad_name || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.lead_id}</td>
                    <td className="px-3 py-2">{l.fields?.full_name || '—'}</td>
                    <td className="px-3 py-2">{l.fields?.email || '—'}</td>
                    <td className="px-3 py-2">{l.fields?.phone || '—'}</td>
                    <td className="px-3 py-2">{l.fields?.zip || '—'}</td>
                    <td className="px-3 py-2">{l.fields?.city || '—'}</td>
                    {dynamicFieldKeys.map((k) => (
                      <td key={k} className="px-3 py-2 text-muted-foreground">{l.fields?.[k] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
