import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { projectQuery } from '@/lib/projectQueries';
import { ladeRechnungen, type Rechnung } from '@/lib/rechnungen';

// Data Adapter Pattern — swap these for external API hooks later

interface DataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Zustand einer Kennzahl-Quelle: 'ok' = gemessen (auch echte Null), 'leer' = Quelle ohne Daten, 'fehler' = nicht erreichbar. */
export type QuellenZustand = 'laedt' | 'ok' | 'leer' | 'fehler';

const zustand = (loading: boolean, error: string | null, hatDaten: boolean): QuellenZustand =>
  loading ? 'laedt' : error ? 'fehler' : hatDaten ? 'ok' : 'leer';

function useAutoRefresh(refetch: () => void, intervalMs = 5 * 60 * 1000) {
  useEffect(() => {
    const id = setInterval(refetch, intervalMs);
    return () => clearInterval(id);
  }, [refetch, intervalMs]);
}

const monatsStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// === DEALS ===
export function useDeals(): DataResult<any[]> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase
      .from('close_deals')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) console.error('[Dashboard] close_deals:', e);
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === REVENUE (MRR aus aktiven Close-Abschlüssen) ===
export type RevenueData = { mrr: number; aktiv: number; ohneWert: number; zustand: QuellenZustand };
export function useRevenue(): DataResult<RevenueData> {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase
      .from('close_deals')
      .select('id, wert_eur, laufzeit_monate')
      .eq('status', 'Aktiv');
    if (e) console.error('[Dashboard] MRR (close_deals):', e);
    setRows(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);

  // Monatlicher Wert = Vertragswert / Laufzeit; Verträge ohne beides zählen mit, fließen aber nicht in den Betrag ein.
  const mitWert = rows.filter(r => Number(r.wert_eur) > 0 && Number(r.laufzeit_monate) > 0);
  const mrr = mitWert.reduce((s, r) => s + Number(r.wert_eur) / Number(r.laufzeit_monate), 0);
  return { data: { mrr, aktiv: rows.length, ohneWert: rows.length - mitWert.length, zustand: zustand(loading, error, rows.length > 0) }, loading, error, refetch };
}

// === INVOICES (Qonto + lexoffice über src/lib/rechnungen.ts) ===
export function useInvoices(): DataResult<Rechnung[]> & { zustand: QuellenZustand } {
  const [data, setData] = useState<Rechnung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const res = await Promise.allSettled([ladeRechnungen('qonto'), ladeRechnungen('lexoffice')]);
    const fehler: string[] = [];
    const out: Rechnung[] = [];
    res.forEach((r, i) => {
      if (r.status === 'fulfilled') out.push(...r.value);
      else { console.error(`[Dashboard] Rechnungen ${i === 0 ? 'Qonto' : 'lexoffice'}:`, r.reason); fehler.push(i === 0 ? 'Qonto' : 'lexoffice'); }
    });
    setData(out);
    // Nur Fehler, wenn gar nichts geladen werden konnte; Teilausfall wird geloggt.
    setError(fehler.length === 2 ? 'Rechnungen nicht erreichbar' : null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch, zustand: zustand(loading, error, data.length > 0) };
}

// === CASH COLLECT (einzige Definition: Bonus-Modell) ===
export function useCashCollect(): DataResult<{ summe: number; anzahl: number; zustand: QuellenZustand }> {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase
      .from('bonus_cash_collect')
      .select('betrag')
      .eq('monat', monatsStart())
      .eq('zugeordnet', true);
    if (e) console.error('[Dashboard] bonus_cash_collect:', e);
    setRows(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  const summe = rows.reduce((s, r) => s + Number(r.betrag || 0), 0);
  return { data: { summe, anzahl: rows.length, zustand: zustand(loading, error, rows.length > 0) }, loading, error, refetch };
}

// === SALES PERFORMANCE ===
export function useSalesPerformance(period: 'week' | 'month' | 'all' = 'week'): DataResult<any[]> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('sales_performance').select('*');
    if (period === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
      query = query.gte('datum', d.toISOString().split('T')[0]);
    } else if (period === 'month') {
      query = query.gte('datum', monatsStart());
    }
    const { data: d, error: e } = await query;
    if (e) console.error('[Dashboard] sales_performance:', e);
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, [period]);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === TASKS ===
export function useTasks(limit = 10): DataResult<any[]> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'Erledigt')
      .order('due_date', { ascending: true })
      .limit(limit);
    if (e) console.error('[Dashboard] tasks:', e);
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, [limit]);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === TEAM ===
export function useTeam(): DataResult<any[]> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase.from('team').select('*');
    if (e) console.error('[Dashboard] team:', e);
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === PROJECTS ===
export function useProjects(): DataResult<any[]> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await projectQuery();
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === EFFIZIENZ SCORE ===
/** Teilscores sind null, wenn mangels Daten nicht berechenbar; sie fallen dann aus der Gewichtung, die übrigen werden normalisiert. */
export interface EffizienzResult {
  score: number | null;
  scoreA: number | null;
  scoreB: number | null;
  scoreC: number | null;
  avgDaysOpen: number;
  loading: boolean;
  error: string | null;
}

export function gewichteterScore(teile: { wert: number | null; gewicht: number }[]): number | null {
  const da = teile.filter(t => t.wert !== null);
  const g = da.reduce((s, t) => s + t.gewicht, 0);
  if (!da.length || g === 0) return null;
  return Math.round(da.reduce((s, t) => s + (t.wert as number) * t.gewicht, 0) / g);
}

export function useEffizienzScore(): EffizienzResult {
  const [result, setResult] = useState<EffizienzResult>({ score: null, scoreA: null, scoreB: null, scoreC: null, avgDaysOpen: 0, loading: true, error: null });

  const compute = useCallback(async () => {
    try {
      const [projectsRes, tasksRes, dealsRes] = await Promise.all([
        projectQuery(),
        supabase.from('tasks').select('created_at, updated_at').eq('status', 'Erledigt'),
        supabase.from('close_deals').select('created_at, start_datum').not('start_datum', 'is', null),
      ]);
      for (const r of [projectsRes, tasksRes, dealsRes]) if (r.error) throw r.error;

      const projects = projectsRes.data || [];
      const closedTasks = tasksRes.data || [];
      const deals = dealsRes.data || [];

      // A: Termintreue (40 %) – Anteil der Projekte mit Enddatum, die nicht überfällig sind.
      const withDue = projects.filter((p: any) => p.enddatum);
      const scoreA = withDue.length
        ? Math.round((withDue.filter((p: any) => p.status === 'Abgeschlossen' || new Date(p.enddatum) >= new Date()).length / withDue.length) * 100)
        : null;

      // B: Bearbeitungszeit erledigter Aufgaben (40 %).
      let scoreB: number | null = null;
      let avgDaysOpen = 0;
      if (closedTasks.length) {
        const totalDays = closedTasks.reduce((sum: number, t: any) => sum + (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / 86400000, 0);
        avgDaysOpen = totalDays / closedTasks.length;
        scoreB = Math.min(100, Math.max(0, Math.round(100 - ((avgDaysOpen - 3) / 11 * 100))));
      }

      // C: Laufzeitstart innerhalb von 7 Tagen nach Abschluss (20 %).
      const scoreC = deals.length
        ? Math.round((deals.filter((d: any) => Math.abs((new Date(d.start_datum).getTime() - new Date(d.created_at).getTime()) / 86400000) <= 7).length / deals.length) * 100)
        : null;

      const score = gewichteterScore([{ wert: scoreA, gewicht: 0.4 }, { wert: scoreB, gewicht: 0.4 }, { wert: scoreC, gewicht: 0.2 }]);
      setResult({ score, scoreA, scoreB, scoreC, avgDaysOpen, loading: false, error: null });
    } catch (e) {
      console.error('[Dashboard] Effizienz-Score:', e);
      setResult(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : String((e as any)?.message || e) }));
    }
  }, []);

  useEffect(() => { compute(); }, [compute]);
  return result;
}

// === ALERTS (aggregated) ===
export interface Alert {
  severity: 'red' | 'yellow' | 'blue';
  message: string;
  link: string;
  entity: string;
}

const kundeLink = (d: any) => d.client_id ? `/kunden/${d.client_id}` : '/kunden/laufzeiten';

export function useAlerts(deals: any[], invoices: Rechnung[], salesData: any[], team: any[], tasks: any[]): Alert[] {
  const alerts: Alert[] = [];

  invoices.filter(i => i.status === 'überfällig').slice(0, 3).forEach(i => {
    alerts.push({
      severity: 'red',
      message: `Rechnung überfällig: ${i.kunde || i.number || '–'} — €${i.amount.toLocaleString('de-DE')}`,
      link: '/finanzen/rechnungen',
      entity: i.id,
    });
  });

  deals.filter(d => d.ampelstatus === 'Rot' && d.status === 'Aktiv').forEach(d => {
    alerts.push({ severity: 'red', message: `${d.client_name} — Ampelstatus Rot`, link: kundeLink(d), entity: d.id });
  });

  deals.filter(d => {
    if (d.status !== 'Aktiv' || !d.start_datum || !d.laufzeit_monate) return false;
    const end = new Date(d.start_datum);
    end.setMonth(end.getMonth() + d.laufzeit_monate);
    const daysLeft = (end.getTime() - Date.now()) / 86400000;
    return daysLeft < 14 && daysLeft > 0;
  }).forEach(d => {
    const end = new Date(d.start_datum);
    end.setMonth(end.getMonth() + d.laufzeit_monate);
    const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000);
    alerts.push({ severity: 'yellow', message: `Laufzeit endet in ${daysLeft} Tagen: ${d.client_name}`, link: kundeLink(d), entity: d.id });
  });

  const setterMap = new Map<string, { calls: number; showUps: number; appts: number; name: string }>();
  salesData.forEach(r => {
    const existing = setterMap.get(r.setter_id) || { calls: 0, showUps: 0, appts: 0, name: '' };
    existing.calls += r.calls_made || 0;
    existing.showUps += r.show_ups || 0;
    existing.appts += r.appointments_set || 0;
    const t = team.find(t => t.id === r.setter_id);
    if (t) existing.name = t.name;
    setterMap.set(r.setter_id, existing);
  });
  setterMap.forEach((v) => {
    if (v.appts > 0 && (v.showUps / v.appts) < 0.6) {
      const rate = Math.round((v.showUps / v.appts) * 100);
      alerts.push({ severity: 'yellow', message: `Show-up Rate kritisch: ${v.name} (${rate}%)`, link: '/sales/kpis', entity: v.name });
    }
  });

  const today = new Date().toISOString().split('T')[0];
  tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'Erledigt')
    .slice(0, 3)
    .forEach(t => {
      alerts.push({ severity: 'blue', message: `Aufgabe überfällig: ${t.title}`, link: '/projekte/aufgaben', entity: t.id });
    });

  return alerts.slice(0, 8);
}

// === QONTO KONTEN ===
export function useQontoAccounts(): DataResult<{ accounts: any[]; total_balance: number; zustand: QuellenZustand }> {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase.from('qonto_bank_accounts').select('id, name, balance, status');
    if (e) console.error('[Dashboard] qonto_bank_accounts:', e);
    setAccounts(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch, 10 * 60 * 1000);
  const total_balance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  return { data: { accounts, total_balance, zustand: zustand(loading, error, accounts.length > 0) }, loading, error, refetch };
}

// === META (30 Tage) ===
export function useMetaLiveTotals(): DataResult<{ spend: number; leads: number; cpl: number | null; lastSync: string | null; zustand: QuellenZustand }> {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const { data: r, error: e } = await supabase
      .from('meta_insights')
      .select('spend, leads, synced_at')
      .gte('date_start', d.toISOString().split('T')[0]);
    if (e) console.error('[Dashboard] meta_insights:', e);
    setRows(r || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  const spend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
  const leads = rows.reduce((s, r) => s + Number(r.leads || 0), 0);
  return {
    data: { spend, leads, cpl: leads > 0 ? spend / leads : null, lastSync: rows[0]?.synced_at || null, zustand: zustand(loading, error, rows.length > 0) },
    loading, error, refetch,
  };
}
