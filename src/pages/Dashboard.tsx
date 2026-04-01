import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Euro, AlertCircle, Phone, AlertTriangle, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';

const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive' };

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const [d, inv, rec, s, t, tk] = await Promise.all([
        supabase.from('close_deals').select('*').order('created_at', { ascending: false }),
        supabase.from('invoices').select('*'),
        supabase.from('recurring_revenues').select('*').eq('is_active', true),
        supabase.from('sales_performance').select('*').gte('datum', weekAgo),
        supabase.from('team').select('*'),
        supabase.from('tasks').select('*'),
      ]);
      setDeals(d.data || []);
      setInvoices(inv.data || []);
      setRecurring(rec.data || []);
      setSalesData(s.data || []);
      setTeam(t.data || []);
      setTasks(tk.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const mrr = useMemo(() => recurring.reduce((s, r) => s + Number(r.monthly_amount || 0), 0), [recurring]);
  const activeClients = useMemo(() => deals.filter(d => d.status === 'Aktiv').length, [deals]);
  const openInvoicesTotal = useMemo(() => invoices.filter(i => i.status === 'Versendet').reduce((s, i) => s + Number(i.brutto || 0), 0), [invoices]);
  const weekDeals = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    return deals.filter(d => d.created_at >= weekAgo);
  }, [deals]);
  const weekCalls = useMemo(() => salesData.reduce((s, r) => s + (r.calls_made || 0), 0), [salesData]);

  // Alerts
  const rotClients = useMemo(() => deals.filter(d => d.ampelstatus === 'Rot' && d.status === 'Aktiv'), [deals]);
  const overdueInvoices = useMemo(() => invoices.filter(i => {
    if (i.status !== 'Versendet' || !i.faelligkeitsdatum) return false;
    return (Date.now() - new Date(i.faelligkeitsdatum).getTime()) / 86400000 > 14;
  }), [invoices]);
  const expiringDeals = useMemo(() => deals.filter(d => {
    if (d.status !== 'Aktiv' || !d.start_datum || !d.laufzeit_monate) return false;
    const end = new Date(d.start_datum);
    end.setMonth(end.getMonth() + d.laufzeit_monate);
    return (end.getTime() - Date.now()) / 86400000 < 14 && end.getTime() > Date.now();
  }), [deals]);

  // Setter KPIs
  const setterKPIs = useMemo(() => {
    const map = new Map<string, { calls: number; appts: number; showUps: number; revenue: number }>();
    salesData.forEach(r => {
      const prev = map.get(r.setter_id) || { calls: 0, appts: 0, showUps: 0, revenue: 0 };
      map.set(r.setter_id, {
        calls: prev.calls + (r.calls_made || 0), appts: prev.appts + (r.appointments_set || 0),
        showUps: prev.showUps + (r.show_ups || 0), revenue: prev.revenue + Number(r.revenue_generated || 0),
      });
    });
    return Array.from(map.entries())
      .map(([id, d]) => ({ id, name: team.find(t => t.id === id)?.name || '–', ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [salesData, team]);

  const lowShowUpSetters = useMemo(() =>
    setterKPIs.filter(s => s.appts > 0 && (s.showUps / s.appts) < 0.6), [setterKPIs]);

  const hasAlerts = rotClients.length > 0 || overdueInvoices.length > 0 || lowShowUpSetters.length > 0 || expiringDeals.length > 0;

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Dashboard wird geladen">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Übersicht</h1>
        <p className="text-muted-foreground text-sm">Viral Connect · Haush Haush Digital</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="MRR" value={`€${mrr.toLocaleString('de-DE')}`} icon={Euro} />
        <StatCard title="Aktive Kunden" value={activeClients} icon={Users} subtitle={`${deals.length} Deals gesamt`} />
        <StatCard title="Offene Rechnungen" value={`€${openInvoicesTotal.toLocaleString('de-DE')}`} icon={AlertCircle} />
        <StatCard title="Abschlüsse (Woche)" value={weekDeals.length} icon={TrendingUp} subtitle={`${weekCalls} Calls`} />
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <section className="space-y-3" aria-label="Wichtige Warnungen">
          <h2 className="text-sm font-medium uppercase tracking-wider text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Handlungsbedarf
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="alert">
            {rotClients.map(c => (
              <Card key={c.id} className="border-destructive/40 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate(`/kunden/${c.id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-destructive flex-shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">{c.client_name}</p><p className="text-xs text-muted-foreground">Ampelstatus: Rot</p></div>
                </CardContent>
              </Card>
            ))}
            {overdueInvoices.map(i => (
              <Card key={i.id} className="border-destructive/40 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate('/finanzen?tab=rechnungen')}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Euro className="h-4 w-4 text-destructive flex-shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">€{Number(i.brutto).toLocaleString('de-DE')} überfällig</p><p className="text-xs text-muted-foreground">Rechnung {i.invoice_nr}</p></div>
                </CardContent>
              </Card>
            ))}
            {lowShowUpSetters.map(s => (
              <Card key={s.id} className="border-warning/40 bg-warning/5">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">{s.name}: Show-up {s.appts > 0 ? ((s.showUps / s.appts) * 100).toFixed(0) : 0}%</p><p className="text-xs text-muted-foreground">unter 60% Schwelle</p></div>
                </CardContent>
              </Card>
            ))}
            {expiringDeals.map(d => (
              <Card key={d.id} className="border-warning/40 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => navigate(`/kunden/${d.id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Clock className="h-4 w-4 text-warning flex-shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">{d.client_name}</p><p className="text-xs text-muted-foreground">Laufzeit endet in &lt;14 Tagen</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Letzte Abschlüsse */}
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => navigate('/kunden')}>
          <CardHeader><CardTitle className="text-base">Letzte Abschlüsse</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {deals.slice(0, 10).map(d => (
              <div key={d.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{d.client_name}</p>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{d.art}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{d.deal_type}</Badge>
                    {Array.isArray(d.leistungen) && d.leistungen.slice(0, 2).map((l: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{l}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-primary">€{Number(d.wert_eur || 0).toLocaleString('de-DE')}</p>
                  <p className="text-[10px] text-muted-foreground">{d.laufzeit_monate}M</p>
                </div>
              </div>
            ))}
            {deals.length === 0 && <p className="text-sm text-muted-foreground">Keine Deals vorhanden</p>}
          </CardContent>
        </Card>

        {/* Middle: Offene Aufgaben */}
        <Card>
          <CardHeader><CardTitle className="text-base">Offene Aufgaben</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tasks.filter(t => t.status !== 'Erledigt' && t.due_date && new Date(t.due_date) <= new Date()).slice(0, 8).map(t => {
              const overdue = new Date(t.due_date) < new Date();
              return (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">{t.title}</span>
                  <span className={`text-xs ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{t.due_date}</span>
                </div>
              );
            })}
            {tasks.filter(t => t.status !== 'Erledigt').length === 0 && <p className="text-sm text-muted-foreground">Keine offenen Aufgaben</p>}
          </CardContent>
        </Card>

        {/* Right: Team Quick View */}
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => navigate('/performance')}>
          <CardHeader><CardTitle className="text-base">Setter KPIs (Woche)</CardTitle></CardHeader>
          <CardContent>
            {setterKPIs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Daten diese Woche</p>
            ) : (
              <div className="space-y-3">
                {setterKPIs.slice(0, 5).map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary w-4">{i + 1}</span>
                      <span className="truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{s.calls} Calls</span>
                      <span className="font-medium text-foreground">€{s.revenue.toLocaleString('de-DE')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
