import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Euro, AlertCircle, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
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

  // All setters with data
  const setterKPIs = useMemo(() => {
    const setters = team.filter(t => ['Setter', 'Closer'].includes(t.rolle));
    return setters.map(setter => {
      const data = salesData.filter(r => r.setter_id === setter.id);
      const calls = data.reduce((s, r) => s + (r.calls_made || 0), 0);
      const appts = data.reduce((s, r) => s + (r.appointments_set || 0), 0);
      const showUps = data.reduce((s, r) => s + (r.show_ups || 0), 0);
      const revenue = data.reduce((s, r) => s + Number(r.revenue_generated || 0), 0);
      return { id: setter.id, name: setter.name, calls, appts, showUps, revenue };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [salesData, team]);

  const lowShowUpSetters = useMemo(() => setterKPIs.filter(s => s.appts > 0 && (s.showUps / s.appts) < 0.6), [setterKPIs]);
  const hasAlerts = rotClients.length > 0 || overdueInvoices.length > 0 || lowShowUpSetters.length > 0 || expiringDeals.length > 0;

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Übersicht</h1>
        <p className="text-muted-foreground text-sm">Viral Connect · Haush Haush Digital</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="MRR" value={`€${mrr.toLocaleString('de-DE')}`} icon={Euro} />
        <StatCard title="Aktive Kunden" value={activeClients} icon={Users} subtitle={`${deals.length} Deals gesamt`} />
        <StatCard title="Offene Rechnungen" value={`€${openInvoicesTotal.toLocaleString('de-DE')}`} icon={AlertCircle} />
        <StatCard title="Abschlüsse (Woche)" value={weekDeals.length} icon={TrendingUp} subtitle={`${weekDeals.length} Deals diese Woche`} />
      </div>

      {hasAlerts && (
        <section className="space-y-3" aria-label="Wichtige Warnungen">
          <p className="text-xs font-medium uppercase tracking-widest text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Handlungsbedarf
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="alert">
            {rotClients.map(c => (
              <Card key={c.id} className="border-destructive/40 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate(`/kunden/${c.id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-destructive shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">{c.client_name}</p><p className="text-xs text-muted-foreground">Ampelstatus: Rot</p></div>
                </CardContent>
              </Card>
            ))}
            {overdueInvoices.map(i => (
              <Card key={i.id} className="border-destructive/40 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate('/finanzen/rechnungen')}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Euro className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">€{Number(i.brutto).toLocaleString('de-DE')} überfällig</p><p className="text-xs text-muted-foreground">Rechnung {i.invoice_nr}</p></div>
                </CardContent>
              </Card>
            ))}
            {expiringDeals.map(d => (
              <Card key={d.id} className="border-warning/40 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => navigate(`/kunden/${d.id}`)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Clock className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">{d.client_name}</p><p className="text-xs text-muted-foreground">Laufzeit endet in &lt;14 Tagen</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/kunden/abschluesse')}>
          <CardHeader><CardTitle className="text-base">Letzte Abschlüsse</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {deals.slice(0, 8).map(d => (
              <div key={d.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{d.client_name}</p>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{d.art}</Badge>
                    <Badge variant="outline" className="text-[10px]">{d.deal_type}</Badge>
                  </div>
                </div>
                <span className="text-right shrink-0 font-medium text-primary">€{Number(d.wert_eur || 0).toLocaleString('de-DE')}</span>
              </div>
            ))}
            {deals.length === 0 && <p className="text-sm text-muted-foreground">Keine Deals vorhanden</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Offene Aufgaben</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tasks.filter(t => t.status !== 'Erledigt').slice(0, 8).map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{t.title}</span>
                <span className={`text-xs ${t.due_date && new Date(t.due_date) < new Date() ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{t.due_date || '–'}</span>
              </div>
            ))}
            {tasks.filter(t => t.status !== 'Erledigt').length === 0 && <p className="text-sm text-muted-foreground">Keine offenen Aufgaben</p>}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/sales/kpis')}>
          <CardHeader><CardTitle className="text-base">Setter KPIs (Woche)</CardTitle></CardHeader>
          <CardContent>
            {setterKPIs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Setter im Team</p>
            ) : (
              <div className="space-y-3">
                {setterKPIs.map((s, i) => (
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
