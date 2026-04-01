import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Data Adapter Pattern — swap these for external API hooks later
// e.g.: import { useCloseCRM } from './integrations/close'

interface DataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useAutoRefresh(refetch: () => void, intervalMs = 5 * 60 * 1000) {
  useEffect(() => {
    const id = setInterval(refetch, intervalMs);
    return () => clearInterval(id);
  }, [refetch, intervalMs]);
}

// === DEALS ===
// Future: replace with import { useCloseCRM } from './integrations/close'
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
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === REVENUE ===
// Future: replace with import { useBuchhaltung } from './integrations/buchhaltung'
export function useRevenue(): DataResult<{ mrr: number; recurring: any[] }> {
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase
      .from('recurring_revenues')
      .select('*')
      .eq('is_active', true);
    setRecurring(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);

  const mrr = recurring.reduce((s, r) => s + Number(r.monthly_amount || 0), 0);
  return { data: { mrr, recurring }, loading, error, refetch };
}

// === INVOICES ===
export function useInvoices(): DataResult<any[]> {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: d, error: e } = await supabase.from('invoices').select('*');
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === SALES PERFORMANCE ===
// Future: replace with Close CRM activities
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
      const d = new Date();
      query = query.gte('datum', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
    const { data: d, error: e } = await query;
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, [period]);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === TASKS ===
// Future: replace with Notion tasks via webhook
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
    const { data: d, error: e } = await supabase.from('projects').select('*');
    setData(d || []);
    setError(e?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  useAutoRefresh(refetch);
  return { data, loading, error, refetch };
}

// === EFFIZIENZ SCORE ===
// TODO: enhance with n8n webhook data when fulfillment tracking is live
export interface EffizienzResult {
  score: number;
  scoreA: number;
  scoreB: number;
  scoreC: number;
  avgDaysOpen: number;
  loading: boolean;
}

export function useEffizienzScore(): EffizienzResult {
  const [result, setResult] = useState<EffizienzResult>({ score: 0, scoreA: 100, scoreB: 100, scoreC: 100, avgDaysOpen: 0, loading: true });

  const compute = useCallback(async () => {
    try {
      const [projectsRes, tasksRes, dealsRes] = await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('tasks').select('*').eq('status', 'Abgeschlossen'),
        supabase.from('close_deals').select('*').not('start_datum', 'is', null),
      ]);

      const projects = projectsRes.data || [];
      const closedTasks = tasksRes.data || [];
      const deals = dealsRes.data || [];

      // Sub-metric A: Deadline compliance (40%)
      const withDue = projects.filter(p => p.enddatum);
      let scoreA = 100;
      if (withDue.length > 0) {
        const onTime = withDue.filter(p => p.status === 'Abgeschlossen' && p.updated_at && p.updated_at <= p.enddatum + 'T23:59:59').length;
        // If none completed yet, use ratio of not-overdue
        const notOverdue = withDue.filter(p => p.status !== 'Abgeschlossen' ? new Date(p.enddatum) >= new Date() : true).length;
        scoreA = Math.round((notOverdue / withDue.length) * 100);
      }

      // Sub-metric B: Avg ticket processing time (40%)
      let scoreB = 100;
      let avgDaysOpen = 0;
      if (closedTasks.length > 0) {
        const totalDays = closedTasks.reduce((sum, t) => {
          const created = new Date(t.created_at).getTime();
          const updated = new Date(t.updated_at).getTime();
          return sum + (updated - created) / 86400000;
        }, 0);
        avgDaysOpen = totalDays / closedTasks.length;
        scoreB = Math.max(0, Math.round(100 - ((avgDaysOpen - 3) / 11 * 100)));
      }

      // Sub-metric C: Laufzeit compliance (20%)
      let scoreC = 100;
      if (deals.length > 0) {
        const onTime = deals.filter(d => {
          const created = new Date(d.created_at);
          const start = new Date(d.start_datum);
          const diff = Math.abs((start.getTime() - created.getTime()) / 86400000);
          return diff <= 7;
        }).length;
        scoreC = Math.round((onTime / deals.length) * 100);
      }

      const score = Math.round(scoreA * 0.4 + scoreB * 0.4 + scoreC * 0.2);
      setResult({ score, scoreA, scoreB, scoreC, avgDaysOpen, loading: false });
    } catch {
      setResult(prev => ({ ...prev, loading: false }));
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

export function useAlerts(deals: any[], invoices: any[], salesData: any[], team: any[], tasks: any[]): Alert[] {
  const alerts: Alert[] = [];

  // Overdue invoices
  invoices.filter(i => i.status === 'Überfällig').forEach(i => {
    alerts.push({
      severity: 'red',
      message: `Rechnung überfällig: ${i.client_name || i.invoice_nr} — €${Number(i.brutto || 0).toLocaleString('de-DE')}`,
      link: '/finanzen/rechnungen',
      entity: i.id,
    });
  });

  // Red ampel clients
  deals.filter(d => d.ampelstatus === 'Rot' && d.status === 'Aktiv').forEach(d => {
    alerts.push({
      severity: 'red',
      message: `${d.client_name} — Ampelstatus Rot`,
      link: `/kunden/${d.id}`,
      entity: d.id,
    });
  });

  // Expiring deals (<14 days)
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
    alerts.push({
      severity: 'yellow',
      message: `Laufzeit endet in ${daysLeft} Tagen: ${d.client_name}`,
      link: `/kunden/${d.id}`,
      entity: d.id,
    });
  });

  // Low show-up rate setters
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
      alerts.push({
        severity: 'yellow',
        message: `Show-up Rate kritisch: ${v.name} (${rate}%)`,
        link: '/sales/kpis',
        entity: v.name,
      });
    }
  });

  // Overdue tasks
  const today = new Date().toISOString().split('T')[0];
  tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'Erledigt' && t.status !== 'Abgeschlossen')
    .slice(0, 3)
    .forEach(t => {
      alerts.push({
        severity: 'blue',
        message: `Aufgabe überfällig: ${t.title}`,
        link: '/projekte/aufgaben',
        entity: t.id,
      });
    });

  return alerts.slice(0, 8);
}
