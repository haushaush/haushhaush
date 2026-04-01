import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDeals, useRevenue, useInvoices, useSalesPerformance, useTasks, useTeam, useAlerts, useEffizienzScore } from '@/hooks/useDataSources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Euro, Users, Clock, TrendingUp, BarChart3, Target, FolderOpen, CreditCard, UserCircle, ListTodo, AlertTriangle, ArrowRight, ChevronRight, Phone, CalendarCheck, Trophy, Banknote, Wallet, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const LEISTUNG_SHORT: Record<string, string> = {
  'Meta Werbeanzeigen': 'Meta Ads',
  'Ads Landing Page - Onepage': 'OnePage',
  'CRM Setup & Anbindung': 'CRM',
  'Vorqualifizierung': 'Vorquali',
  'Superchat': 'Superchat',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateLong() {
  return new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getFirstName(user: any) {
  const meta = user?.user_metadata;
  if (meta?.full_name) return meta.full_name.split(' ')[0];
  if (meta?.name) return meta.name.split(' ')[0];
  const email = user?.email || '';
  const part = email.split('@')[0] || 'User';
  return part.charAt(0).toUpperCase() + part.slice(1);
}

// --- Inline SVG illustration ---
function TrendIllustration() {
  return (
    <svg width="120" height="60" viewBox="0 0 120 60" fill="none" className="opacity-80" aria-hidden="true">
      <path d="M5 50 Q20 45 30 35 T55 20 T80 15 T105 5" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-primary" />
      <circle cx="105" cy="5" r="4" className="fill-primary" />
      <path d="M100 2 L105 5 L100 8" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      <path d="M5 50 Q20 45 30 35 T55 20 T80 15 T105 5 L105 60 L5 60 Z" className="fill-primary/5" />
    </svg>
  );
}

// --- Navigation tiles ---
const NAV_TILES = [
  { icon: BarChart3, label: 'Sales', sub: 'KPIs & Leaderboard', href: '/sales/kpis' },
  { icon: Target, label: 'Fulfillment', sub: 'Ad Performance', href: '/fulfillment/ads' },
  { icon: Users, label: 'Kunden', sub: 'Pipeline & Deals', href: '/kunden/pipeline' },
  { icon: CreditCard, label: 'Finanzen', sub: 'Rechnungen & MRR', href: '/finanzen/rechnungen' },
  { icon: UserCircle, label: 'Team & HR', sub: 'Mitarbeiter', href: '/hr/mitarbeiter' },
  { icon: ListTodo, label: 'Aufgaben', sub: 'Offene Tasks', href: '/projekte/aufgaben' },
];

const RANK_COLORS = ['#F5A623', '#9B9B9B', '#8B6347'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const deals = useDeals();
  const revenue = useRevenue();
  const invoices = useInvoices();
  const team = useTeam();
  const tasks = useTasks(10);
  const [salesPeriod, setSalesPeriod] = useState<'week' | 'month'>('week');
  const salesPerfMonth = useSalesPerformance('month');
  const effizienz = useEffizienzScore();

  const loading = deals.loading || revenue.loading || invoices.loading || team.loading || tasks.loading;

  const alerts = useAlerts(deals.data, invoices.data, salesPerf.data, team.data, tasks.data);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthName = now.toLocaleDateString('de-DE', { month: 'long' });

  // CARD 1: Umsatz aktueller Monat
  // TODO: replace with Buchhaltung API or DATEV export
  const umsatzThisMonth = useMemo(() => invoices.data
    .filter(i => i.status === 'Bezahlt' && new Date(i.created_at).getMonth() === currentMonth && new Date(i.created_at).getFullYear() === currentYear)
    .reduce((s, i) => s + Number(i.brutto || 0), 0), [invoices.data, currentMonth, currentYear]);
  const umsatzLastMonth = useMemo(() => {
    const lm = currentMonth === 0 ? 11 : currentMonth - 1;
    const ly = currentMonth === 0 ? currentYear - 1 : currentYear;
    return invoices.data
      .filter(i => i.status === 'Bezahlt' && new Date(i.created_at).getMonth() === lm && new Date(i.created_at).getFullYear() === ly)
      .reduce((s, i) => s + Number(i.brutto || 0), 0);
  }, [invoices.data, currentMonth, currentYear]);
  const umsatzTrend = umsatzLastMonth > 0 ? ((umsatzThisMonth - umsatzLastMonth) / umsatzLastMonth * 100) : null;

  // CARD 2: Cash Collect
  // TODO: connect to Stripe/bank feed for actual cash received
  const cashCollect = useMemo(() => invoices.data
    .filter(i => ['Versendet', 'Überfällig'].includes(i.status || '') && i.faelligkeitsdatum && new Date(i.faelligkeitsdatum).getMonth() === currentMonth && new Date(i.faelligkeitsdatum).getFullYear() === currentYear)
    , [invoices.data, currentMonth, currentYear]);
  const cashCollectTotal = useMemo(() => cashCollect.reduce((s, i) => s + Number(i.brutto || 0), 0), [cashCollect]);
  const cashCollectOverdue = useMemo(() => cashCollect.filter(i => i.status === 'Überfällig').length, [cashCollect]);

  // CARD 3: Kunden
  // TODO: sync live from Close CRM API
  const activeClients = useMemo(() => deals.data.filter(d => d.status === 'Aktiv').length, [deals.data]);
  const neukunden = useMemo(() => deals.data.filter(d => d.deal_type === 'Neukunde' && new Date(d.created_at).getMonth() === currentMonth && new Date(d.created_at).getFullYear() === currentYear).length, [deals.data, currentMonth, currentYear]);
  const upsells = useMemo(() => deals.data.filter(d => d.deal_type === 'Upsell' && new Date(d.created_at).getMonth() === currentMonth && new Date(d.created_at).getFullYear() === currentYear).length, [deals.data, currentMonth, currentYear]);

  // CARD 4: Top Vertriebler
  // TODO: pull from Close CRM activities API
  const topSeller = useMemo(() => {
    const map = new Map<string, { revenue: number; closes: number }>();
    (salesPerfMonth.data || []).forEach(r => {
      const ex = map.get(r.setter_id) || { revenue: 0, closes: 0 };
      ex.revenue += Number(r.revenue_generated || 0);
      ex.closes += (r.closes || 0);
      map.set(r.setter_id, ex);
    });
    let best: { id: string; name: string; initials: string; revenue: number; closes: number } | null = null;
    map.forEach((v, id) => {
      if (!best || v.revenue > best.revenue) {
        const t = team.data.find(t => t.id === id);
        const name = t?.name || 'Unbekannt';
        best = { id, name, initials: name.split(' ').map((n: string) => n[0]).join('').slice(0, 2), ...v };
      }
    });
    return best;
  }, [salesPerfMonth.data, team.data]);

  // CARD 5: Offene Rechnungen
  const openInvoices = useMemo(() => invoices.data.filter(i => ['Versendet', 'Entwurf', 'Überfällig'].includes(i.status || '')), [invoices.data]);
  const openInvoicesTotal = useMemo(() => openInvoices.reduce((s, i) => s + Number(i.brutto || 0), 0), [openInvoices]);
  const sentInvoices = useMemo(() => invoices.data.filter(i => i.status === 'Versendet'), [invoices.data]);
  const sentTotal = useMemo(() => sentInvoices.reduce((s, i) => s + Number(i.brutto || 0), 0), [sentInvoices]);
  const overdueInvoices = useMemo(() => invoices.data.filter(i => i.status === 'Überfällig'), [invoices.data]);
  const overdueTotal = useMemo(() => overdueInvoices.reduce((s, i) => s + Number(i.brutto || 0), 0), [overdueInvoices]);
  const allPaid = openInvoices.length === 0;

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const weekDeals = useMemo(() => deals.data.filter(d => new Date(d.created_at) >= weekStart), [deals.data, weekStart]);
  const weekVolume = useMemo(() => weekDeals.reduce((s, d) => s + Number(d.wert_eur || 0), 0), [weekDeals]);

  // Sales top 3
  const salesTop3 = useMemo(() => {
    const map = new Map<string, { calls: number; appts: number; closes: number; revenue: number }>();
    salesPerf.data.forEach(r => {
      const ex = map.get(r.setter_id) || { calls: 0, appts: 0, closes: 0, revenue: 0 };
      ex.calls += r.calls_made || 0;
      ex.appts += r.appointments_set || 0;
      ex.closes += r.closes || 0;
      ex.revenue += Number(r.revenue_generated || 0);
      map.set(r.setter_id, ex);
    });
    return Array.from(map.entries())
      .map(([id, stats]) => {
        const t = team.data.find(t => t.id === id);
        const tq = stats.calls > 0 ? Math.round((stats.appts / stats.calls) * 100) : 0;
        return { id, name: t?.name || 'Unbekannt', initials: (t?.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2), ...stats, tq };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }, [salesPerf.data, team.data]);

  // Revenue chart (last 6 months from invoices)
  const revenueChart = useMemo(() => {
    // TODO: replace with Close CRM revenue data when integrated
    // const data = useCloseRevenue() || useSupabaseRevenue()
    const months: { name: string; bezahlt: number; offen: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const name = d.toLocaleDateString('de-DE', { month: 'short' });
      const paid = invoices.data
        .filter(inv => inv.status === 'Bezahlt' && new Date(inv.leistungsdatum || inv.created_at).getFullYear() === y && new Date(inv.leistungsdatum || inv.created_at).getMonth() === m)
        .reduce((s, inv) => s + Number(inv.brutto || 0), 0);
      const open = invoices.data
        .filter(inv => (inv.status === 'Versendet' || inv.status === 'Überfällig') && new Date(inv.leistungsdatum || inv.created_at).getFullYear() === y && new Date(inv.leistungsdatum || inv.created_at).getMonth() === m)
        .reduce((s, inv) => s + Number(inv.brutto || 0), 0);
      months.push({ name, bezahlt: paid, offen: open });
    }
    return months;
  }, [invoices.data]);

  // Task completion handler
  const completeTask = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'Erledigt' }).eq('id', taskId);
    tasks.refetch();
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <div className="flex justify-between items-end">
          <div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-40" /></div>
          <Skeleton className="h-14 w-28" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Hero Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-foreground leading-tight">
            Herzlich Willkommen, {getFirstName(user)}! 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDateLong()}</p>
        </div>
        <div className="hidden sm:block"><TrendIllustration /></div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group" onClick={() => navigate('/finanzen')}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">MRR</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground">€{mrr.toLocaleString('de-DE')}</p>
                <p className="text-xs text-muted-foreground">Monatlich wiederkehrend</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Euro className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group" onClick={() => navigate('/kunden')}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Aktive Kunden</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground">{activeClients}</p>
                <p className="text-xs text-muted-foreground">{totalDeals} Deals gesamt</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Users className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group" onClick={() => navigate('/finanzen/rechnungen')}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Offene Rechnungen</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground">€{openInvoicesTotal.toLocaleString('de-DE')}</p>
                <p className="text-xs text-muted-foreground">{openInvoices.length} Rechnungen offen</p>
                {overdueCount > 0 && <Badge variant="destructive" className="text-[10px] mt-1">{overdueCount} überfällig</Badge>}
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Clock className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group" onClick={() => navigate('/kunden/abschluesse')}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Abschlüsse (Woche)</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground">{weekDeals.length}</p>
                <p className="text-xs text-muted-foreground">€{weekVolume.toLocaleString('de-DE')} Volumen</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><TrendingUp className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Quick Navigation */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {NAV_TILES.map(tile => (
          <Card
            key={tile.href}
            className="cursor-pointer hover:border-primary transition-all group"
            onClick={() => navigate(tile.href)}
          >
            <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center gap-1.5">
              <tile.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <p className="text-xs sm:text-sm font-medium text-foreground leading-tight">{tile.label}</p>
              <p className="text-[10px] text-muted-foreground hidden sm:block">{tile.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 4. Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" /> Handlungsbedarf
            </p>
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    a.severity === 'red'
                      ? 'bg-destructive/5 dark:bg-destructive/10 border-l-[3px] border-l-destructive'
                      : a.severity === 'yellow'
                      ? 'bg-warning/5 dark:bg-warning/10 border-l-[3px] border-l-warning'
                      : 'bg-primary/5 dark:bg-primary/10 border-l-[3px] border-l-primary'
                  }`}
                  onClick={() => navigate(a.link)}
                >
                  <span className="text-foreground">{a.message}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 ml-3">
                    Ansehen <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Letzte Abschlüsse */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Letzte Abschlüsse</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/kunden/abschluesse')}>
                Alle ansehen <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-0">
            {deals.data.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">Noch keine Abschlüsse diese Woche.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/kunden/abschluesse')}>
                  Mit Close CRM synchronisieren
                </Button>
              </div>
            ) : (
              deals.data.slice(0, 5).map((d, i) => {
                const leistungen: string[] = Array.isArray(d.leistungen) ? d.leistungen : [];
                return (
                  <div
                    key={d.id}
                    className={`py-3 cursor-pointer hover:bg-muted/50 transition-colors px-1 -mx-1 rounded ${i < 4 ? 'border-b border-border' : ''}`}
                    onClick={() => navigate(`/kunden/${d.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{d.client_name}</p>
                          {d.art && <Badge variant="secondary" className="text-[10px] shrink-0 bg-primary/10 text-primary border-0">{d.art}</Badge>}
                        </div>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {leistungen.map((l: string) => (
                            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-primary">
                              {LEISTUNG_SHORT[l] || l}
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Start: {d.start_datum ? formatDate(d.start_datum) : '–'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-primary">€{Number(d.wert_eur || 0).toLocaleString('de-DE')}</p>
                        <Badge variant={d.deal_type === 'Neukunde' ? 'default' : 'secondary'} className={`text-[9px] mt-1 ${d.deal_type === 'Neukunde' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0'}`}>
                          {d.deal_type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Column 2: Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Dringendste Aufgaben</CardTitle>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => navigate('/projekte/aufgaben')}>
                + Neu
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-0">
            {tasks.data.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Keine offenen Aufgaben. 🎉</p>
            ) : (
              tasks.data.map((t, i) => {
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = t.due_date && t.due_date < today;
                const isToday = t.due_date === today;
                return (
                  <div key={t.id} className={`flex items-center gap-3 py-2.5 ${i < tasks.data.length - 1 ? 'border-b border-border' : ''}`}>
                    <Checkbox
                      className="shrink-0"
                      onCheckedChange={() => completeTask(t.id)}
                      aria-label={`Aufgabe erledigen: ${t.title}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{t.title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {isOverdue && <span className="text-[11px] font-medium text-destructive">Überfällig</span>}
                      {isToday && !isOverdue && <span className="text-[11px] font-medium text-warning">Heute</span>}
                      {!isOverdue && !isToday && t.due_date && <span className="text-[11px] text-muted-foreground">{formatDate(t.due_date)}</span>}
                      {!t.due_date && <span className="text-[11px] text-muted-foreground">–</span>}
                    </div>
                  </div>
                );
              })
            )}
            {tasks.data.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground" onClick={() => navigate('/projekte/aufgaben')}>
                Alle Aufgaben <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Sales Top 3 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sales Performance</CardTitle>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  className={`text-[11px] px-2.5 py-1 transition-colors ${salesPeriod === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setSalesPeriod('week')}
                >Woche</button>
                <button
                  className={`text-[11px] px-2.5 py-1 transition-colors ${salesPeriod === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setSalesPeriod('month')}
                >Monat</button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {salesTop3.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">Noch keine Performance-Daten.</p>
                <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => navigate('/sales/kpis')}>KPIs eintragen →</Button>
              </div>
            ) : (
              <div className="space-y-0">
                {salesTop3.map((s, i) => (
                  <div key={s.id} className={`py-3 ${i < salesTop3.length - 1 ? 'border-b border-border' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ backgroundColor: RANK_COLORS[i] }}>
                        {i + 1}
                      </div>
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {s.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                        <div className="grid grid-cols-2 gap-x-3 mt-1">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{s.calls} Calls</span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarCheck className="h-3 w-3" />{s.tq}% TQ</span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Trophy className="h-3 w-3" />{s.closes} Abschl.</span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" />€{s.revenue.toLocaleString('de-DE')}</span>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-primary shrink-0">€{s.revenue.toLocaleString('de-DE')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {salesTop3.length > 0 && (
              <>
                <div className="mt-3" aria-label="Team Revenue Trend">
                  <ResponsiveContainer width="100%" height={40}>
                    <LineChart data={salesTop3.map((s, i) => ({ name: s.name, val: s.revenue }))}>
                      <Line type="monotone" dataKey="val" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-1 text-xs text-muted-foreground" onClick={() => navigate('/sales/kpis')}>
                  Vollständig ansehen <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Revenue Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Umsatzentwicklung</CardTitle>
              <p className="text-xs text-muted-foreground">letzte 6 Monate</p>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/finanzen')}>
              Details <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenueChart} barCategoryGap="20%">
              <XAxis dataKey="name" axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={35} />
              <RechartsTooltip
                formatter={(value: number, name: string) => [`€${value.toLocaleString('de-DE')}`, name === 'bezahlt' ? 'Bezahlt' : 'Offen']}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="bezahlt" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
              <Bar dataKey="offen" stackId="a" fill="hsl(var(--primary) / 0.2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
