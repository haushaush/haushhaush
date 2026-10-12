import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useDeals, useRevenue, useInvoices, useSalesPerformance, useTasks, useTeam, useAlerts, useEffizienzScore, useQontoAccounts, useMetaLiveTotals } from '@/hooks/useDataSources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Euro, Users, Clock, TrendingUp, BarChart3, Target, CreditCard, UserCircle, ListTodo, AlertTriangle, ArrowRight, ChevronRight, Phone, CalendarCheck, Trophy, Banknote, Wallet, Zap, ArrowUpRight, ArrowDownRight, RotateCcw, GripVertical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatValue } from '@/lib/utils';
import { MicroLearning } from '@/components/dashboard/MicroLearning';
import MusicPlayer from '@/components/dashboard/MusicPlayer';
import { TimeTracker } from '@/components/dashboard/TimeTracker';
import { GlobalSearchModal } from '@/components/dashboard/GlobalSearch';
import { Search } from 'lucide-react';
import { KpiSlider } from '@/components/dashboard/KpiSlider';
import { SortableBlock } from '@/components/dashboard/SortableBlock';
import { MitteilungenCard } from '@/components/dashboard/MitteilungenCard';
import { OperationalCards } from '@/components/dashboard/OperationalCards';
import { CheckinBanner } from '@/components/dashboard/CheckinBanner';
import { ARIAHeroBlock } from '@/components/aria/ARIAHeroBlock';
import { ARIAPanel } from '@/components/aria/ARIAPanel';
import { useARIA } from '@/contexts/ARIAContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { toast } from 'sonner';

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

  function formatDateLong(d: Date) {
  const dateStr = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${dateStr} · ${timeStr}`;
}




const NAV_TILES = [
  { icon: BarChart3, label: 'Sales', sub: 'KPIs & Leaderboard', href: '/sales/kpis' },
  { icon: Target, label: 'Fulfillment', sub: 'Ad Performance', href: '/fulfillment/ads' },
  { icon: Users, label: 'Kunden', sub: 'Pipeline & Deals', href: '/kunden/pipeline' },
  { icon: CreditCard, label: 'Finanzen', sub: 'Rechnungen & MRR', href: '/finanzen/rechnungen' },
  { icon: UserCircle, label: 'Team & HR', sub: 'Mitarbeiter', href: '/hr/mitarbeiter' },
  { icon: ListTodo, label: 'Aufgaben', sub: 'Offene Tasks', href: '/projekte/aufgaben' },
];

const DEFAULT_ORDER = ['mitteilungen', 'music', 'widgets', 'kpi-slider', 'quicknav', 'handlungsbedarf', 'schnellaktionen', 'bottom-row'];

const BLOCK_LABELS: Record<string, string> = {
  'hero': 'Begrüßung',
  'mitteilungen': 'Neueste Mitteilungen',
  'music': 'Music Player',
  'widgets': 'Learning & Zeiterfassung',
  'kpi-slider': 'KPI Dashboard',
  'quicknav': 'Schnellnavigation',
  'handlungsbedarf': 'Handlungsbedarf',
  'schnellaktionen': 'Schnellaktionen',
  'bottom-row': 'Abschlüsse, Laufzeiten, Projekte',
};

export default function Dashboard() {
  const { user } = useAuth();
  const { firstName, initials, avatarUrl } = useProfile();
  const navigate = useNavigate();
  const { isOpen, messages, clearMessages, openARIA } = useARIA();
  const [ariaInput, setAriaInput] = useState('');
  const [chatVisible, setChatVisible] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAriaSend = (text: string) => {
    if (!text.trim()) return;
    setChatVisible(true);
    if (!isOpen) openARIA();
    window.dispatchEvent(new CustomEvent('aria-send', { detail: text }));
    setAriaInput('');
  };
  const deals = useDeals();
  const revenue = useRevenue();
  const invoices = useInvoices();
  const team = useTeam();
  const tasks = useTasks(10);
  const [salesPeriod, setSalesPeriod] = useState<'week' | 'month'>('week');
  const salesPerf = useSalesPerformance(salesPeriod);
  const salesPerfMonth = useSalesPerformance('month');
  const effizienz = useEffizienzScore();
  const qonto = useQontoAccounts();
  const metaTotals = useMetaLiveTotals();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [searchOpen, setSearchOpen] = useState(false);
  
  const [activeId, setActiveId] = useState<string | null>(null);

  const VALID_IDS = new Set(DEFAULT_ORDER);

  const [blockOrder, setBlockOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard-layout');
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // Keep only valid IDs, drop any orphaned/old ones
        const cleaned = parsed.filter((id: string) => VALID_IDS.has(id));
        // Add any missing new blocks
        const missing = DEFAULT_ORDER.filter(id => !cleaned.includes(id));
        const merged = [...cleaned, ...missing];
        return merged;
      }
    } catch {}
    return DEFAULT_ORDER;
  });

  useEffect(() => {
    localStorage.setItem('dashboard-layout', JSON.stringify(blockOrder));
  }, [blockOrder]);

  const isMobile = windowWidth < 768;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback(({ active }: any) => setActiveId(active.id), []);
  const handleDragEnd = useCallback(({ active, over }: any) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setBlockOrder(prev => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const resetLayout = useCallback(() => {
    setBlockOrder(DEFAULT_ORDER);
    localStorage.removeItem('dashboard-layout');
    toast('Layout zurückgesetzt');
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fmtCurrency = (v: number) => formatValue(v, 'currency', isMobile);

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

  if (loading) {
    return (
      <div className="px-4 md:px-6 lg:px-10 py-6 md:py-10 space-y-8" role="status" aria-busy="true">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-[72px] w-[72px] rounded-full" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="kpi-grid">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-36 rounded-xl min-w-0" />)}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Skeleton key={i} className="h-80 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const renderBlock = (id: string) => {
    switch (id) {
      case 'hero':
        return (
          <div className="flex flex-col items-center text-center pt-2 pb-2 w-full">
            <Avatar className="h-24 w-24 border-[3px] border-card mb-4">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={firstName} /> : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-[36px] font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <h1 className="text-[32px] font-bold text-foreground leading-tight tracking-[-0.02em]">
              Herzlich Willkommen, {firstName}! 👋
            </h1>
            <p className="text-[15px] text-muted-foreground mt-1.5" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' }}>{formatDateLong(clock)}</p>
            {!isMobile && JSON.stringify(blockOrder) !== JSON.stringify(DEFAULT_ORDER) && (
              <button
                onClick={resetLayout}
                className="inline-flex items-center gap-[5px] mt-2 px-[10px] py-[3px] text-[11px] text-muted-foreground bg-transparent border border-border rounded-md cursor-pointer transition-all duration-150 hover:text-destructive hover:border-destructive hover:bg-destructive/10"
              >
                <RotateCcw className="h-[11px] w-[11px]" /> Layout zurücksetzen
              </button>
            )}
          </div>
        );
      case 'search':
        return null; // search is now part of quicknav block
      case 'mitteilungen':
        return <MitteilungenCard />;
      case 'music':
        return null; // music widget hidden
      case 'widgets':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full items-stretch">
            <MicroLearning />
            <TimeTracker />
          </div>
        );
      case 'kpi-slider':
        return (
          <KpiSlider
            deals={deals.data}
            invoices={invoices.data}
            revenue={revenue.data}
            salesPerf={salesPerf.data}
            salesPerfMonth={salesPerfMonth.data}
            team={team.data}
            tasks={tasks.data}
            effizienz={effizienz}
            isMobile={isMobile}
            qonto={qonto.data}
            metaTotals={metaTotals.data}
          />
        );
      case 'quicknav':
        return (
          <div className="space-y-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 rounded-[10px] border border-border bg-card text-muted-foreground hover:border-primary/30 hover:shadow-sm transition-all cursor-text"
              style={{ height: 44 }}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="text-[15px]">Kunden, Aufgaben, Seiten suchen...</span>
              <kbd className="ml-auto hidden sm:inline-flex items-center text-[11px] font-medium bg-background border border-border rounded-md px-1.5 py-0.5 tracking-wide">⌘K</kbd>
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {NAV_TILES.map(tile => (
                <Card key={tile.href} className="cursor-pointer card-interactive group rounded-xl overflow-hidden min-w-0" onClick={() => navigate(tile.href)}>
                  <CardContent className="px-4 py-5 flex flex-col items-center text-center gap-2">
                    <tile.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    <p className="text-[14px] font-medium text-foreground leading-tight truncate w-full">{tile.label}</p>
                    <p className="text-xs text-muted-foreground hidden sm:block truncate w-full">{tile.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      case 'handlungsbedarf':
        if (alerts.length === 0) return null;
        return (
          <div className="bg-card border border-border rounded-[14px] p-5 px-6">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Handlungsbedarf
            </p>
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`alert-holo ${a.severity === 'red' ? 'alert-holo-red' : a.severity === 'yellow' ? 'alert-holo-orange' : 'alert-holo-teal'}`} onClick={() => navigate(a.link)}>
                  <span className="text-foreground">{a.message}</span>
                  <span className="text-[13px] text-muted-foreground flex items-center gap-1 shrink-0 ml-3 hover:text-primary transition-colors">
                    Ansehen <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      case 'bottom-row':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Letzte Abschlüsse */}
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
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/kunden/abschluesse')}>Mit Close CRM synchronisieren</Button>
                  </div>
                ) : (
                  deals.data.slice(0, 5).map((d, i) => {
                    const leistungen: string[] = Array.isArray(d.leistungen) ? d.leistungen : [];
                    return (
                      <div key={d.id} className={`py-3 cursor-pointer hover:bg-muted/50 transition-colors px-1 -mx-1 rounded ${i < 4 ? 'border-b border-border' : ''}`} onClick={() => navigate(`/kunden/${d.id}`)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">{d.client_name}</p>
                              {d.art && <Badge variant="secondary" className="text-[10px] shrink-0 bg-primary/10 text-primary border-0">{d.art}</Badge>}
                            </div>
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {leistungen.map((l: string) => (
                                <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-primary">{LEISTUNG_SHORT[l] || l}</span>
                              ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">Start: {d.start_datum ? formatDate(d.start_datum) : '–'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-primary">€{formatValue(Number(d.wert_eur || 0), 'number')}</p>
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

            <OperationalCards />
          </div>
        );
      default:
        return null;
    }
  };

  const orderToUse = isMobile ? DEFAULT_ORDER : blockOrder;

  return (
    <div className="px-4 md:px-6 lg:px-10 py-6 md:py-10">

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CheckinBanner />

      {/* Hero — locked at top (ARIA input hidden) */}
      <div className="mb-8 space-y-0">
        {renderBlock('hero')}
      </div>

      <DndContext
        sensors={isMobile ? undefined : sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderToUse} strategy={verticalListSortingStrategy}>
          <div className="space-y-8">
            {orderToUse.map(id => {
              const block = renderBlock(id);
              if (block === null && (id === 'handlungsbedarf' || id === 'music')) return null;
              return (
                <SortableBlock key={id} id={id} disabled={isMobile}>
                  {renderBlock(id)}
                </SortableBlock>
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div className="bg-card border border-primary/30 rounded-xl px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-medium text-foreground">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              {BLOCK_LABELS[activeId] || activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
