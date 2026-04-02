import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDeals, useRevenue, useInvoices, useSalesPerformance, useTasks, useTeam, useAlerts, useEffizienzScore } from '@/hooks/useDataSources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Euro, Users, Clock, TrendingUp, BarChart3, Target, CreditCard, UserCircle, ListTodo, AlertTriangle, ArrowRight, ChevronRight, Phone, CalendarCheck, Trophy, Banknote, Wallet, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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

function getFirstName(user: any, teamData?: any[]) {
  // Try team table first
  if (teamData && user?.email) {
    const member = teamData.find((m: any) => m.email === user.email);
    if (member?.name) return member.name.split(' ')[0];
  }
  const meta = user?.user_metadata;
  if (meta?.full_name) return meta.full_name.split(' ')[0];
  if (meta?.name) return meta.name.split(' ')[0];
  const email = user?.email || '';
  const part = email.split('@')[0] || 'User';
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function getInitials(user: any, teamData?: any[]) {
  if (teamData && user?.email) {
    const member = teamData.find((m: any) => m.email === user.email);
    if (member?.name) {
      const parts = member.name.split(' ');
      return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
    }
  }
  const meta = user?.user_metadata;
  const name = meta?.full_name || meta?.name || user?.email?.split('@')[0] || 'U';
  const parts = name.split(' ');
  return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
}

function getAvatarUrl(user: any) {
  return user?.user_metadata?.avatar_url || null;
}



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
  const salesPerf = useSalesPerformance(salesPeriod);
  const salesPerfMonth = useSalesPerformance('month');
  const effizienz = useEffizienzScore();



  const loading = deals.loading || revenue.loading || invoices.loading || team.loading || tasks.loading;

  const alerts = useAlerts(deals.data, invoices.data, salesPerf.data, team.data, tasks.data);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthName = now.toLocaleDateString('de-DE', { month: 'long' });

  // CARD 1: Umsatz aktueller Monat
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
  const cashCollect = useMemo(() => invoices.data
    .filter(i => ['Versendet', 'Überfällig'].includes(i.status || '') && i.faelligkeitsdatum && new Date(i.faelligkeitsdatum).getMonth() === currentMonth && new Date(i.faelligkeitsdatum).getFullYear() === currentYear)
    , [invoices.data, currentMonth, currentYear]);
  const cashCollectTotal = useMemo(() => cashCollect.reduce((s, i) => s + Number(i.brutto || 0), 0), [cashCollect]);
  const cashCollectOverdue = useMemo(() => cashCollect.filter(i => i.status === 'Überfällig').length, [cashCollect]);

  // CARD 3: Kunden
  const activeClients = useMemo(() => deals.data.filter(d => d.status === 'Aktiv').length, [deals.data]);
  const neukunden = useMemo(() => deals.data.filter(d => d.deal_type === 'Neukunde' && new Date(d.created_at).getMonth() === currentMonth && new Date(d.created_at).getFullYear() === currentYear).length, [deals.data, currentMonth, currentYear]);
  const upsells = useMemo(() => deals.data.filter(d => d.deal_type === 'Upsell' && new Date(d.created_at).getMonth() === currentMonth && new Date(d.created_at).getFullYear() === currentYear).length, [deals.data, currentMonth, currentYear]);

  // CARD 4: Top Vertriebler
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
      <div className="px-6 md:px-12 py-10 space-y-8" role="status" aria-busy="true">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-[72px] w-[72px] rounded-full" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-80 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const avatarUrl = getAvatarUrl(user);
  const initials = getInitials(user, team.data);
  const firstName = getFirstName(user, team.data);

  return (
    <div className="px-6 md:px-12 py-10 space-y-8">
      {/* 1. Hero — Centered greeting with avatar */}
      <div className="flex flex-col items-center text-center pt-2 pb-2">
        <Avatar className="h-[72px] w-[72px] border-[3px] border-card mb-4">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={firstName} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground text-[28px] font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-[32px] font-bold text-foreground leading-tight tracking-[-0.02em]">
          Herzlich Willkommen, {firstName}! 👋
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1.5">{formatDateLong()}</p>
      </div>

      {/* 2. KPI Cards — 6 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* CARD 1: Umsatz */}
        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group rounded-[14px]" onClick={() => navigate('/finanzen')}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">UMSATZ</p>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><TrendingUp className="h-5 w-5 text-primary" /></div>
            </div>
            <p className="text-[28px] font-bold text-foreground leading-tight">{umsatzThisMonth.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Bezahlt im {monthName} {currentYear}</p>
            {umsatzTrend !== null ? (
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium mt-2 px-1.5 py-0.5 rounded-full ${umsatzTrend >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                {umsatzTrend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {umsatzTrend >= 0 ? '+' : ''}{umsatzTrend.toFixed(1)}%
              </span>
            ) : <span className="text-[10px] text-muted-foreground mt-2 inline-block">–</span>}
          </CardContent>
        </Card>

        {/* CARD 2: Cash Collect */}
        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group rounded-[14px]" onClick={() => navigate('/finanzen/rechnungen')}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CASH COLLECT</p>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Wallet className="h-5 w-5 text-primary" /></div>
            </div>
            <p className="text-[28px] font-bold text-foreground leading-tight">{cashCollectTotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{cashCollect.length} Rechnungen fällig</p>
            {cashCollectOverdue > 0 && <Badge variant="destructive" className="text-[10px] mt-2">⚠ {cashCollectOverdue} überfällig</Badge>}
          </CardContent>
        </Card>

        {/* CARD 3: Kunden */}
        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group rounded-[14px]" onClick={() => navigate('/kunden')}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">KUNDEN GESAMT</p>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Users className="h-5 w-5 text-primary" /></div>
            </div>
            <p className="text-[28px] font-bold text-foreground leading-tight">{activeClients}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{neukunden} Neukunden diesen Monat</p>
            <p className="text-[11px] text-muted-foreground">{upsells} Upsells</p>
          </CardContent>
        </Card>

        {/* CARD 4: Top Vertriebler */}
        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group rounded-[14px]" onClick={() => navigate('/sales/kpis')}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">TOP VERTRIEBLER</p>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors"><Trophy className="h-5 w-5 text-amber-500" /></div>
            </div>
            {topSeller ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">{topSeller.initials}</div>
                  <p className="text-sm font-semibold text-foreground truncate">{topSeller.name}</p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{topSeller.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} · {topSeller.closes} Abschlüsse</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Noch keine Daten</p>}
          </CardContent>
        </Card>

        {/* CARD 5: Offene Rechnungen */}
        <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group rounded-[14px]" onClick={() => navigate('/finanzen/rechnungen')}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">OFFENE RECHNUNGEN</p>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Clock className="h-5 w-5 text-primary" /></div>
            </div>
            {allPaid ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Alle Rechnungen bezahlt 🎉</p>
            ) : (
              <>
                <p className="text-[28px] font-bold text-foreground leading-tight">{openInvoicesTotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Gesamt ausstehend</p>
                <div className="mt-2 space-y-0.5">
                  {sentInvoices.length > 0 && <p className="text-[11px] text-muted-foreground">{sentInvoices.length} Versendet · {sentTotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>}
                  {overdueInvoices.length > 0 && <p className="text-[11px] text-destructive font-medium">{overdueInvoices.length} Überfällig · {overdueTotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* CARD 6: Effizienz Score */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="cursor-pointer hover:border-primary hover:shadow-md transition-all group rounded-[14px]" onClick={() => navigate('/projekte')}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">EFFIZIENZ</p>
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Zap className="h-5 w-5 text-primary" /></div>
                  </div>
                  {effizienz.loading ? (
                    <Skeleton className="h-12 w-full rounded" />
                  ) : (
                    <>
                      <div className="flex items-end gap-1">
                        <span className={`text-[28px] font-bold leading-tight ${effizienz.score >= 80 ? 'text-primary' : effizienz.score >= 60 ? 'text-amber-500' : 'text-destructive'}`}>{effizienz.score}</span>
                        <span className="text-sm text-muted-foreground mb-0.5">/100</span>
                      </div>
                      <svg width="48" height="28" viewBox="0 0 48 28" className="mt-2" aria-hidden="true">
                        <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke="hsl(var(--border))" strokeWidth="3" strokeLinecap="round" />
                        <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke={effizienz.score >= 80 ? 'hsl(var(--primary))' : effizienz.score >= 60 ? '#FF9F0A' : '#FF3B30'} strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={`${(effizienz.score / 100) * 62.8} 62.8`} />
                      </svg>
                      <p className="text-[10px] text-muted-foreground mt-1">Deadlines {effizienz.scoreA}% · Tickets {effizienz.scoreB}% · Laufzeit {effizienz.scoreC}%</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px] text-xs">
              <p>Deadlines: {effizienz.scoreA}% der Projekte pünktlich</p>
              <p>Ø Ticket-Bearbeitungszeit: {effizienz.avgDaysOpen.toFixed(1)} Tage</p>
              <p>Laufzeiteinhaltung: {effizienz.scoreC}% Kunden pünktlich</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 3. Quick Navigation */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {NAV_TILES.map(tile => (
          <Card
            key={tile.href}
            className="cursor-pointer hover:border-primary transition-all group rounded-xl"
            onClick={() => navigate(tile.href)}
          >
            <CardContent className="px-4 py-5 flex flex-col items-center text-center gap-2">
              <tile.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              <p className="text-sm font-medium text-foreground leading-tight">{tile.label}</p>
              <p className="text-xs text-muted-foreground hidden sm:block">{tile.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 4. Alerts — wrapped container */}
      {alerts.length > 0 && (
        <div className="bg-card border border-border rounded-[14px] p-5 px-6">
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Handlungsbedarf
          </p>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm cursor-pointer transition-colors border-l-[3px] hover:bg-accent ${
                  a.severity === 'red'
                    ? 'border-l-destructive'
                    : a.severity === 'yellow'
                    ? 'border-l-warning'
                    : 'border-l-primary'
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
        </div>
      )}

      {/* 5. 4-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Column 1: Letzte Abschlüsse */}
        <Card className="rounded-[14px]">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Letzte Abschlüsse</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/kunden/abschluesse')}>
                Alle <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-0">
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
        <Card className="rounded-[14px]">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Dringendste Aufgaben</CardTitle>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => navigate('/projekte/aufgaben')}>
                + Neu
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-0">
            {tasks.data.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Keine offenen Aufgaben. 🎉</p>
            ) : (
              tasks.data.map((t, i) => {
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = t.due_date && t.due_date < today;
                const isToday = t.due_date === today;
                return (
                  <div key={t.id} className={`flex items-center gap-3 py-2.5 leading-relaxed ${i < tasks.data.length - 1 ? 'border-b border-border' : ''}`}>
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
        <Card className="rounded-[14px]">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Sales Performance</CardTitle>
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
          <CardContent className="p-6 pt-0">
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
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
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
                    <LineChart data={salesTop3.map((s) => ({ name: s.name, val: s.revenue }))}>
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

        {/* Column 4: Notifications Preview */}
        <Card className="rounded-[14px]">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Benachrichtigungen</CardTitle>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setDrawerOpen(true)}>
                Alle <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {notifLoading ? (
              <div className="space-y-3" aria-busy="true">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-2 animate-pulse">
                    <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">Keine Benachrichtigungen</p>
              </div>
            ) : (
              <div className="space-y-0">
                {notifications.slice(0, 6).map((n, i) => {
                  const tag = categorizeNotification(n.title, n.preview, n.channel, n.metadata as Record<string, any>);
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-2.5 py-2.5 cursor-pointer rounded-lg px-1 -mx-1 hover:bg-accent transition-colors ${i < Math.min(notifications.length, 6) - 1 ? 'border-b border-border' : ''}`}
                      onClick={() => handleNotifClick(n)}
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${getChannelBg(n.channel)}`}>
                        {getChannelIcon(n.channel)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] leading-tight text-foreground truncate ${!n.read ? 'font-medium' : 'font-normal'}`}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {tag && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{tag}</span>
                          )}
                          <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                      {!n.read && (
                        <div className="flex-shrink-0 mt-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Revenue Chart */}
      <Card className="rounded-[14px]">
        <CardHeader className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Umsatzentwicklung</CardTitle>
              <p className="text-xs text-muted-foreground">letzte 6 Monate</p>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => navigate('/finanzen')}>
              Details <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
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

      {/* Notification Drawer */}
      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
        loading={notifLoading}
        unreadByChannel={unreadByChannel}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
      />
    </div>
  );
}
