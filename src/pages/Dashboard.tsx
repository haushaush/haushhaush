import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Euro, AlertCircle, Phone, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';

const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive', 'CC': 'bg-purple-400' };
const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success', 'Pausiert': 'bg-warning/20 text-warning',
  'Churned': 'bg-destructive/20 text-destructive', 'Lead': 'bg-primary/20 text-primary',
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [finance, setFinance] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const [c, f, s, t] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('finance').select('*'),
        supabase.from('sales_performance').select('*').gte('datum', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]),
        supabase.from('team').select('*'),
      ]);
      setClients(c.data || []);
      setFinance(f.data || []);
      setSalesData(s.data || []);
      setTeam(t.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const activeClients = useMemo(() => clients.filter(c => c.kundenstatus === 'In Betreuung'), [clients]);
  const mrr = useMemo(() => finance.filter(f => f.typ === 'Einnahme').reduce((s, f) => s + Number(f.betrag), 0), [finance]);
  const openInvoices = useMemo(() => finance.filter(f => f.zahlstatus === 'Offen' && f.typ === 'Einnahme').reduce((s, f) => s + Number(f.betrag), 0), [finance]);
  const weekCalls = useMemo(() => salesData.reduce((s, r) => s + (r.calls_made || 0), 0), [salesData]);

  // Alerts
  const rotClients = useMemo(() => clients.filter(c => c.ampelstatus === 'Rot'), [clients]);
  const overdueInvoices = useMemo(() => finance.filter(f => {
    if (f.zahlstatus !== 'Offen' || f.typ !== 'Einnahme') return false;
    const daysSince = (Date.now() - new Date(f.datum).getTime()) / 86400000;
    return daysSince > 14;
  }), [finance]);

  // Setter weekly KPIs
  const setterKPIs = useMemo(() => {
    const map = new Map<string, { calls: number; appts: number; showUps: number; revenue: number }>();
    salesData.forEach(r => {
      const prev = map.get(r.setter_id) || { calls: 0, appts: 0, showUps: 0, revenue: 0 };
      map.set(r.setter_id, {
        calls: prev.calls + (r.calls_made || 0),
        appts: prev.appts + (r.appointments_set || 0),
        showUps: prev.showUps + (r.show_ups || 0),
        revenue: prev.revenue + Number(r.revenue_generated || 0),
      });
    });
    return Array.from(map.entries())
      .map(([id, d]) => ({ id, name: team.find(t => t.id === id)?.name || '–', ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [salesData, team]);

  const lowShowUpSetters = useMemo(() =>
    setterKPIs.filter(s => s.appts > 0 && (s.showUps / s.appts) < 0.6), [setterKPIs]);

  // Pipeline counts
  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach(c => { counts[c.kundenstatus] = (counts[c.kundenstatus] || 0) + 1; });
    return counts;
  }, [clients]);

  const hasAlerts = rotClients.length > 0 || overdueInvoices.length > 0 || lowShowUpSetters.length > 0;

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
        <p className="text-muted-foreground text-sm">Haush Haush Digital · Viral Connect</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="MRR" value={`€${mrr.toLocaleString('de-DE')}`} icon={Euro} />
        <StatCard title="Aktive Kunden" value={activeClients.length} icon={Users} subtitle={`${clients.length} gesamt`} />
        <StatCard title="Offene Rechnungen" value={`€${openInvoices.toLocaleString('de-DE')}`} icon={AlertCircle} />
        <StatCard title="Calls diese Woche" value={weekCalls} icon={Phone} />
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
                  <div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">Ampelstatus: Rot</p></div>
                </CardContent>
              </Card>
            ))}
            {overdueInvoices.map(f => (
              <Card key={f.id} className="border-destructive/40 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate('/finanzen')}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Euro className="h-4 w-4 text-destructive flex-shrink-0" aria-hidden="true" />
                  <div><p className="text-sm font-medium">€{Number(f.betrag).toLocaleString('de-DE')} überfällig</p><p className="text-xs text-muted-foreground">Rechnung {f.rechnung_nr || f.datum}</p></div>
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
          </div>
        </section>
      )}

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pipeline */}
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => navigate('/kunden')}>
          <CardHeader><CardTitle className="text-base">Kunden-Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {['Lead', 'In Betreuung', 'Pausiert', 'Churned'].map(status => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[status]}`}>{status}</Badge>
                </div>
                <span className="text-lg font-heading font-bold">{pipelineCounts[status] || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Middle: Recent Activity */}
        <Card>
          <CardHeader><CardTitle className="text-base">Letzte Aktivitäten</CardTitle></CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Aktivitäten</p>
            ) : (
              <div className="space-y-3">
                {clients.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center gap-3 text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(`/kunden/${c.id}`)}>
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${AMPEL_DOT[c.ampelstatus]}`} aria-hidden="true" />
                    <span className="truncate flex-1">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleDateString('de-DE')}</span>
                  </div>
                ))}
              </div>
            )}
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
