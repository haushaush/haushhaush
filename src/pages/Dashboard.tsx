import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Euro, FolderOpen, AlertCircle, Palette } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';

const AMPEL_COLORS: Record<string, string> = { 'Grün': '#22c55e', 'Gelb': '#eab308', 'Rot': '#ef4444', 'CC': '#8b5cf6' };
const tooltipStyle = { backgroundColor: 'hsl(216, 35%, 11%)', border: '1px solid hsl(216, 25%, 18%)', borderRadius: '8px', color: 'hsl(210, 40%, 92%)' };

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ clients: 0, activeClients: 0, projects: 0, revenue: 0, openInvoices: 0 });
  const [ampelData, setAmpelData] = useState<{ name: string; value: number }[]>([]);
  const [revenueData, setRevenueData] = useState<{ month: string; einnahmen: number; ausgaben: number }[]>([]);
  const [creativePipeline, setCreativePipeline] = useState<{ status: string; count: number }[]>([]);
  const [creativeAlerts, setCreativeAlerts] = useState<{ overdue: number; waitingFeedback: number; recentApproved: number }>({ overdue: 0, waitingFeedback: 0, recentApproved: 0 });
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const [clientsRes, projectsRes, financeRes, creativeRes] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('finance').select('*'),
        supabase.from('creative_projects').select('*'),
      ]);
      const clients = clientsRes.data || [];
      const projects = projectsRes.data || [];
      const finance = financeRes.data || [];
      const activeClients = clients.filter(c => c.kundenstatus === 'In Betreuung').length;
      const revenue = finance.filter(f => f.typ === 'Einnahme').reduce((sum, f) => sum + Number(f.betrag), 0);
      const openInvoices = finance.filter(f => f.zahlstatus === 'Offen' && f.typ === 'Einnahme').reduce((sum, f) => sum + Number(f.betrag), 0);
      setStats({ clients: clients.length, activeClients, projects: projects.length, revenue, openInvoices });
      const ampelCounts: Record<string, number> = { 'Grün': 0, 'Gelb': 0, 'Rot': 0, 'CC': 0 };
      clients.forEach(c => { ampelCounts[c.ampelstatus] = (ampelCounts[c.ampelstatus] || 0) + 1; });
      setAmpelData(Object.entries(ampelCounts).map(([name, value]) => ({ name, value })));
      const monthMap: Record<string, { einnahmen: number; ausgaben: number }> = {};
      finance.forEach(f => {
        const m = f.datum.substring(0, 7);
        if (!monthMap[m]) monthMap[m] = { einnahmen: 0, ausgaben: 0 };
        if (f.typ === 'Einnahme') monthMap[m].einnahmen += Number(f.betrag);
        else monthMap[m].ausgaben += Number(f.betrag);
      });
      setRevenueData(Object.entries(monthMap).sort().slice(-6).map(([month, d]) => ({ month, ...d })));

      // Creative pipeline
      const creatives = (creativeRes.data || []) as any[];
      const statusCounts: Record<string, number> = {};
      creatives.forEach((c: any) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
      setCreativePipeline(Object.entries(statusCounts).map(([status, count]) => ({ status, count })));
      const now = Date.now();
      const twoDaysAgo = now - 48 * 60 * 60 * 1000;
      setCreativeAlerts({
        overdue: creatives.filter((c: any) => c.due_date && new Date(c.due_date).getTime() < now && !['Archiviert', 'Live'].includes(c.status)).length,
        waitingFeedback: creatives.filter((c: any) => c.status === 'Kunde Review' && new Date(c.updated_at).getTime() < twoDaysAgo).length,
        recentApproved: creatives.filter((c: any) => c.status === 'Freigegeben').length,
      });

      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Dashboard wird geladen">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const chartHeight = isMobile ? 220 : 280;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Übersicht aller Kennzahlen</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Aktive Kunden" value={stats.activeClients} icon={Users} subtitle={`${stats.clients} gesamt`} />
        <StatCard title="Projekte" value={stats.projects} icon={FolderOpen} />
        <StatCard title="Umsatz (gesamt)" value={`€${stats.revenue.toLocaleString('de-DE')}`} icon={Euro} />
        <StatCard title="Offene Rechnungen" value={`€${stats.openInvoices.toLocaleString('de-DE')}`} icon={AlertCircle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Umsatz & Ausgaben</CardTitle></CardHeader>
          <CardContent>
            <div role="img" aria-label={`Umsatz-Diagramm: ${revenueData.map(d => `${d.month}: €${d.einnahmen} Einnahmen, €${d.ausgaben} Ausgaben`).join('; ')}`}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={revenueData}>
                  <XAxis dataKey="month" stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 10 : 12} />
                  <YAxis stroke="hsl(215, 20%, 55%)" fontSize={isMobile ? 10 : 12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="einnahmen" fill="hsl(43, 56%, 52%)" radius={[4, 4, 0, 0]} name="Einnahmen" />
                  <Bar dataKey="ausgaben" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} name="Ausgaben" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Ampelstatus Verteilung</CardTitle></CardHeader>
          <CardContent>
            <div role="img" aria-label={`Ampelstatus: ${ampelData.map(d => `${d.name}: ${d.value}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie data={ampelData} cx="50%" cy="50%" outerRadius={isMobile ? 70 : 100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {ampelData.map(entry => <Cell key={entry.name} fill={AMPEL_COLORS[entry.name]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Creative Pipeline Widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" aria-hidden="true" /> Creative Pipeline
          </CardTitle>
          <button onClick={() => navigate('/creatives')} className="text-xs text-primary hover:underline min-h-[44px] flex items-center">
            Alle anzeigen →
          </button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            {creativePipeline.map(s => (
              <div key={s.status} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="text-xs">{s.count}</Badge>
                <span className="text-muted-foreground">{s.status}</span>
              </div>
            ))}
            {creativePipeline.length === 0 && <p className="text-muted-foreground text-sm">Keine Creative Projekte</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            {creativeAlerts.overdue > 0 && (
              <Badge variant="destructive">{creativeAlerts.overdue} überfällig</Badge>
            )}
            {creativeAlerts.waitingFeedback > 0 && (
              <Badge className="bg-amber-500/20 text-amber-300">{creativeAlerts.waitingFeedback} wartet auf Feedback &gt;48h</Badge>
            )}
            {creativeAlerts.recentApproved > 0 && (
              <Badge className="bg-emerald-500/20 text-emerald-300">{creativeAlerts.recentApproved} freigegeben</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
