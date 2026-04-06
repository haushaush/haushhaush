import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, TrendingUp, Users, Target, Trophy, Clock, Zap, Phone, CalendarCheck, BarChart3, Mail, MailCheck, FolderOpen, ListTodo, Activity, DollarSign, Wallet, CreditCard, Receipt, AlertTriangle, UserCircle, GraduationCap, UserPlus, Calendar, Star, ArrowUpRight, ArrowDownRight, CheckSquare, Timer, AlertCircle, BarChart2, Gem, BookOpen } from 'lucide-react';
import { formatValue } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface KpiCardData {
  label: string;
  value: string;
  subtext: string;
  icon: any;
  href: string;
  color?: 'green' | 'orange' | 'red' | 'default';
  badge?: string;
  badgeColor?: 'destructive' | 'default' | 'secondary';
  trend?: number | null;
  gauge?: number;
}

interface SlideData {
  id: string;
  label: string;
  cards: KpiCardData[];
}

interface KpiSliderProps {
  deals: any[];
  invoices: any[];
  revenue: { mrr: number; recurring: any[] };
  salesPerf: any[];
  salesPerfMonth: any[];
  team: any[];
  tasks: any[];
  effizienz: { score: number; scoreA: number; scoreB: number; scoreC: number; avgDaysOpen: number; loading: boolean };
  isMobile: boolean;
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function colorForThreshold(value: number, green: number, orange: number, invert = false): 'green' | 'orange' | 'red' {
  if (invert) {
    if (value <= green) return 'green';
    if (value <= orange) return 'orange';
    return 'red';
  }
  if (value >= green) return 'green';
  if (value >= orange) return 'orange';
  return 'red';
}

const COLOR_MAP = {
  green: 'text-emerald-600 dark:text-emerald-400',
  orange: 'text-amber-500',
  red: 'text-destructive',
  default: 'text-foreground',
};

function KpiCard({ card, isMobile }: { card: KpiCardData; isMobile: boolean }) {
  const navigate = useNavigate();
  const Icon = card.icon;
  const valueColor = card.color ? COLOR_MAP[card.color] : COLOR_MAP.default;

  return (
    <Card
      className="cursor-pointer card-interactive group rounded-[14px] overflow-hidden min-w-0 h-[130px] min-h-[130px] max-h-[130px]"
      onClick={() => navigate(card.href)}
    >
      <CardContent className="p-4 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between mb-1 gap-1">
            <p className="kpi-label text-muted-foreground truncate">{card.label}</p>
            <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
          <p className={cn('kpi-value', valueColor)}>{card.value}</p>
        </div>
        <div className="overflow-hidden">
          <p className="kpi-sub text-muted-foreground line-clamp-1">{card.subtext}</p>
          {card.badge && (
            <Badge variant={card.badgeColor || 'destructive'} className="text-[10px] mt-1 truncate max-w-full">
              {card.badge}
            </Badge>
          )}
          {card.trend !== undefined && card.trend !== null && (
            <span className={cn(
              'inline-flex items-center gap-0.5 text-[10px] font-medium mt-1 px-1.5 py-0.5 rounded-full',
              card.trend >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'
            )}>
              {card.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {card.trend >= 0 ? '+' : ''}{card.trend.toFixed(1)}%
            </span>
          )}
          {card.gauge !== undefined && (
            <svg width="40" height="22" viewBox="0 0 48 28" className="mt-1" aria-hidden="true">
              <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke="hsl(var(--border))" strokeWidth="3" strokeLinecap="round" />
              <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke={card.color === 'green' ? 'hsl(var(--primary))' : card.color === 'orange' ? '#FF9F0A' : '#FF3B30'} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(card.gauge / 100) * 62.8} 62.8`} />
            </svg>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiSlider({ deals, invoices, revenue, salesPerf, salesPerfMonth, team, tasks, effizienz, isMobile }: KpiSliderProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progressKey, setProgressKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const fmtC = (v: number) => formatValue(v, 'currency', isMobile);
  const fmtN = (v: number) => formatValue(v, 'number', isMobile);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthName = now.toLocaleDateString('de-DE', { month: 'long' });
  const weekStart = getWeekStart();

  const slides: SlideData[] = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // === SLIDE 1: ÜBERSICHT ===
    const umsatzThisMonth = invoices
      .filter(i => i.status === 'Bezahlt' && new Date(i.created_at).getMonth() === currentMonth && new Date(i.created_at).getFullYear() === currentYear)
      .reduce((s, i) => s + Number(i.brutto || 0), 0);
    const umsatzLastMonth = invoices
      .filter(i => i.status === 'Bezahlt' && new Date(i.created_at).getMonth() === lastMonth && new Date(i.created_at).getFullYear() === lastMonthYear)
      .reduce((s, i) => s + Number(i.brutto || 0), 0);
    const umsatzTrend = umsatzLastMonth > 0 ? ((umsatzThisMonth - umsatzLastMonth) / umsatzLastMonth * 100) : null;

    const activeClients = deals.filter(d => d.status === 'Aktiv').length;
    const neukunden = deals.filter(d => d.deal_type === 'Neukunde' && new Date(d.created_at).getMonth() === currentMonth && new Date(d.created_at).getFullYear() === currentYear).length;
    const weekDeals = deals.filter(d => new Date(d.created_at) >= weekStart);
    const weekVolume = weekDeals.reduce((s, d) => s + Number(d.wert_eur || 0), 0);

    const setterMap = new Map<string, { revenue: number; closes: number }>();
    (salesPerfMonth || []).forEach(r => {
      const ex = setterMap.get(r.setter_id) || { revenue: 0, closes: 0 };
      ex.revenue += Number(r.revenue_generated || 0);
      ex.closes += (r.closes || 0);
      setterMap.set(r.setter_id, ex);
    });
    let topSeller: { name: string; revenue: number; closes: number } | null = null;
    setterMap.forEach((v, id) => {
      if (!topSeller || v.revenue > topSeller.revenue) {
        const t = team.find(t => t.id === id);
        topSeller = { name: t?.name || 'Unbekannt', ...v };
      }
    });

    const openInvs = invoices.filter(i => ['Versendet', 'Überfällig'].includes(i.status || ''));
    const openTotal = openInvs.reduce((s, i) => s + Number(i.brutto || 0), 0);
    const overdueCount = openInvs.filter(i => i.status === 'Überfällig').length;

    const cashCollectMonth = invoices.filter(i => ['Versendet', 'Überfällig'].includes(i.status || '') && i.faelligkeitsdatum && new Date(i.faelligkeitsdatum).getMonth() === currentMonth && new Date(i.faelligkeitsdatum).getFullYear() === currentYear);
    const cashCollectTotal = cashCollectMonth.reduce((s, i) => s + Number(i.brutto || 0), 0);

    const openTasks = tasks.filter(t => t.status === 'Offen').length;
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'Erledigt').length;

    const slide1: SlideData = {
      id: 'uebersicht', label: 'Übersicht',
      cards: [
        { label: 'UMSATZ', value: fmtC(umsatzThisMonth), subtext: `Bezahlt im ${monthName}`, icon: TrendingUp, href: '/finanzen', trend: umsatzTrend },
        { label: 'AKTIVE KUNDEN', value: String(activeClients), subtext: `${neukunden} Neukunden diesen Monat`, icon: Users, href: '/kunden' },
        { label: 'ABSCHLÜSSE WOCHE', value: String(weekDeals.length), subtext: `${fmtC(weekVolume)} Volumen`, icon: Target, href: '/kunden/abschluesse' },
        { label: 'TOP SETTER', value: topSeller?.name || '–', subtext: topSeller ? `${fmtC(topSeller.revenue)} · ${topSeller.closes} Abschlüsse` : 'Keine Daten', icon: Trophy, href: '/sales/kpis' },
        { label: 'OFFENE RECHNUNGEN', value: fmtC(openTotal), subtext: `${openInvs.length} Rechnungen offen`, icon: Clock, href: '/finanzen/rechnungen', badge: overdueCount > 0 ? `⚠ ${overdueCount} überfällig` : undefined, badgeColor: 'destructive' },
        { label: 'EFFIZIENZ', value: String(effizienz.score), subtext: `Deadlines ${effizienz.scoreA}% · Tickets ${effizienz.scoreB}%`, icon: Zap, href: '/projekte', gauge: effizienz.score, color: effizienz.score >= 80 ? 'green' : effizienz.score >= 60 ? 'orange' : 'red' },
        { label: 'CASH COLLECT', value: fmtC(cashCollectTotal), subtext: 'Erwartet diesen Monat', icon: Wallet, href: '/finanzen/rechnungen' },
        { label: 'OFFENE AUFGABEN', value: String(openTasks), subtext: overdueTasks > 0 ? `${overdueTasks} überfällig` : 'Alle im Plan', icon: CheckSquare, href: '/projekte/aufgaben', color: overdueTasks > 0 ? 'red' : 'green' },
      ],
    };

    // === SLIDE 2: SALES ===
    const salesWeekCalls = (salesPerf || []).reduce((s, r) => s + (r.calls_made || 0), 0);
    const salesMonthAppts = (salesPerfMonth || []).reduce((s, r) => s + (r.appointments_set || 0), 0);
    const salesMonthCalls = (salesPerfMonth || []).reduce((s, r) => s + (r.calls_made || 0), 0);
    const tq = salesMonthCalls > 0 ? Math.round((salesMonthAppts / salesMonthCalls) * 100) : 0;
    const salesMonthShowUps = (salesPerfMonth || []).reduce((s, r) => s + (r.show_ups || 0), 0);
    const showUpRate = salesMonthAppts > 0 ? Math.round((salesMonthShowUps / salesMonthAppts) * 100) : 0;
    const salesMonthCloses = (salesPerfMonth || []).reduce((s, r) => s + (r.closes || 0), 0);
    const salesMonthRevenue = (salesPerfMonth || []).reduce((s, r) => s + Number(r.revenue_generated || 0), 0);
    const salesMonthMails = (salesPerfMonth || []).reduce((s, r) => s + (r.cold_mails_sent || 0), 0);
    const salesMonthMailResp = (salesPerfMonth || []).reduce((s, r) => s + (r.cold_mail_responses || 0), 0);
    const mailRate = salesMonthMails > 0 ? Math.round((salesMonthMailResp / salesMonthMails) * 100) : 0;
    const activeSetters = new Set((salesPerf || []).filter(r => new Date(r.datum) >= weekStart).map(r => r.setter_id)).size;

    const slide2: SlideData = {
      id: 'sales', label: 'Sales',
      cards: [
        { label: 'CALLS DIESE WOCHE', value: fmtN(salesWeekCalls), subtext: 'Alle Setter', icon: Phone, href: '/sales/kpis' },
        { label: 'Ø TERMINQUOTE', value: `${tq}%`, subtext: 'Ziel: >20%', icon: CalendarCheck, href: '/sales/kpis', color: colorForThreshold(tq, 20, 15) },
        { label: 'SHOW-UP RATE', value: `${showUpRate}%`, subtext: 'Ziel: >60%', icon: Users, href: '/sales/kpis', color: colorForThreshold(showUpRate, 60, 45) },
        { label: 'CLOSES MONAT', value: String(salesMonthCloses), subtext: `${fmtC(salesMonthRevenue)} Umsatz`, icon: Trophy, href: '/sales/kpis' },
        { label: 'COLD MAILS', value: fmtN(salesMonthMails), subtext: `${salesMonthMailResp} Antworten · ${mailRate}% Rate`, icon: Mail, href: '/sales/coldmail' },
        { label: 'VORQUALI TQ', value: `${tq}%`, subtext: 'Telefonische Vorqualifikation', icon: BarChart3, href: '/sales/vorquali' },
        { label: 'UMSATZ MONAT', value: fmtC(salesMonthRevenue), subtext: 'Alle Setter kombiniert', icon: TrendingUp, href: '/sales/kpis' },
        { label: 'SETTER AKTIV', value: String(activeSetters), subtext: 'Haben diese Woche gecallt', icon: Users, href: '/sales/kpis' },
      ],
    };

    // === SLIDE 3: FULFILLMENT ===
    const activeProjects = deals.filter(d => !['Abgeschlossen', 'Archiviert', 'Churned'].includes(d.status || '')).length;
    const redAmpel = deals.filter(d => d.ampelstatus === 'Rot').length;

    const slide3: SlideData = {
      id: 'fulfillment', label: 'Fulfillment',
      cards: [
        { label: 'AKTIVE PROJEKTE', value: String(activeProjects), subtext: `${activeClients} Kunden in Betreuung`, icon: FolderOpen, href: '/projekte' },
        { label: 'OFFENE AUFGABEN', value: String(openTasks), subtext: overdueTasks > 0 ? `${overdueTasks} überfällig` : 'Alle im Plan', icon: ListTodo, href: '/projekte/aufgaben', color: overdueTasks > 0 ? 'red' : 'green' },
        { label: 'Ø EFFIZIENZ', value: `${effizienz.score}%`, subtext: 'Geplante vs. Ist-Zeit', icon: Activity, href: '/projekte', color: effizienz.score >= 80 ? 'green' : effizienz.score >= 60 ? 'orange' : 'red' },
        { label: 'CPL INTERN', value: '–', subtext: 'Cost per Lead intern', icon: DollarSign, href: '/fulfillment/ads' },
        { label: 'AD SPEND KUNDEN', value: '–', subtext: '€ in Kundenaccounts', icon: Wallet, href: '/fulfillment/ads' },
        { label: 'AMPEL ROT', value: String(redAmpel), subtext: 'Kunden mit Handlungsbedarf', icon: AlertTriangle, href: '/kunden', color: redAmpel > 0 ? 'red' : 'green' },
        { label: 'ÜBERFÄLLIGE AUFGABEN', value: String(overdueTasks), subtext: overdueTasks > 0 ? 'Sofort handeln' : 'Keine überfällig', icon: AlertCircle, href: '/projekte/aufgaben', color: overdueTasks > 0 ? 'red' : 'green' },
        { label: 'MEETINGS WOCHE', value: '–', subtext: 'Kundenmeetings', icon: Calendar, href: '/kunden' },
      ],
    };

    // === SLIDE 4: FINANZEN ===
    const mrr = revenue.mrr;
    const arr = mrr * 12;
    const paidThisMonth = umsatzThisMonth;
    const overdueInvs = invoices.filter(i => i.status === 'Überfällig');
    const overdueSum = overdueInvs.reduce((s, i) => s + Number(i.brutto || 0), 0);
    const clvTotal = deals.filter(d => d.status === 'Aktiv').reduce((s, d) => s + Number(d.wert_eur || 0), 0);

    const slide4: SlideData = {
      id: 'finanzen', label: 'Finanzen',
      cards: [
        { label: 'MRR', value: fmtC(mrr), subtext: 'Monatlich wiederkehrend', icon: TrendingUp, href: '/finanzen' },
        { label: 'ARR', value: fmtC(arr), subtext: 'Hochrechnung auf 12 Monate', icon: TrendingUp, href: '/finanzen' },
        { label: 'CASH COLLECT', value: fmtC(cashCollectTotal), subtext: `${cashCollectMonth.length} Rechnungen fällig`, icon: CreditCard, href: '/finanzen/rechnungen' },
        { label: 'BEZAHLT', value: fmtC(paidThisMonth), subtext: 'Bereits eingegangen', icon: Receipt, href: '/finanzen', color: 'green' },
        { label: 'ÜBERFÄLLIG', value: String(overdueInvs.length), subtext: fmtC(overdueSum), icon: AlertTriangle, href: '/finanzen/rechnungen', color: overdueInvs.length > 0 ? 'red' : 'green' },
        { label: 'QONTO', value: '–', subtext: 'Qonto verbinden', icon: Wallet, href: '/finanzen/buchhaltung' },
        { label: 'UMSATZ VORMONAT', value: fmtC(umsatzLastMonth), subtext: 'Vormonat zum Vergleich', icon: BarChart2, href: '/finanzen' },
        { label: 'CLV GESAMT', value: fmtC(clvTotal), subtext: 'Aktive Kunden', icon: Gem, href: '/kunden' },
      ],
    };

    // === SLIDE 5: TEAM & HR ===
    const teamCount = team.length;
    const departments = new Set(team.map(t => t.department).filter(Boolean)).size;

    const slide5: SlideData = {
      id: 'team', label: 'Team & HR',
      cards: [
        { label: 'TEAM GESAMT', value: String(teamCount), subtext: `${departments} Abteilungen`, icon: UserCircle, href: '/hr/mitarbeiter' },
        { label: 'AKADEMIE', value: '–', subtext: 'Vertriebsakademie', icon: GraduationCap, href: '/hr/akademie' },
        { label: 'HR-ANFRAGEN', value: '–', subtext: 'Mitarbeiter-Anfragen', icon: UserPlus, href: '/einstellungen' },
        { label: 'PROBEWOCHEN', value: '–', subtext: 'Aktuelle Probewochen', icon: Calendar, href: '/hr/probewoche' },
        { label: 'COACHING', value: '–', subtext: 'Diesen Monat', icon: Phone, href: '/hr/coaching' },
        { label: 'Ø COACHING SCORE', value: '–', subtext: 'Aus 0 Sessions', icon: Star, href: '/hr/coaching' },
        { label: 'WIKI SEITEN', value: '–', subtext: 'SOPs & Prozesse', icon: BookOpen, href: '/hr/wiki' },
        { label: 'ZEIT HEUTE', value: '–', subtext: 'Deine Zeit heute', icon: Timer, href: '/zeiterfassung' },
      ],
    };

    return [slide1, slide2, slide3, slide4, slide5];
  }, [deals, invoices, revenue, salesPerf, salesPerfMonth, team, tasks, effizienz, isMobile, currentMonth, currentYear]);

  const SLIDE_LABELS = slides.map(s => s.label);
  const totalSlides = slides.length;

  const startAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
    autoAdvanceRef.current = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % totalSlides);
      setProgressKey(k => k + 1);
    }, 5000);
  }, [totalSlides]);

  useEffect(() => {
    startAutoAdvance();
    return () => { if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current); };
  }, [startAutoAdvance]);

  const goToSlide = useCallback((i: number) => {
    setActiveSlide(i);
    setProgressKey(k => k + 1);
    startAutoAdvance();
  }, [startAutoAdvance]);

  const prevSlide = () => goToSlide((activeSlide - 1 + totalSlides) % totalSlides);
  const nextSlide = () => goToSlide((activeSlide + 1) % totalSlides);

  const handleMouseEnter = () => {
    setPaused(true);
    if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
  };
  const handleMouseLeave = () => {
    setPaused(false);
    startAutoAdvance();
  };

  return (
    <div className="relative w-full" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Card Grid — full width */}
      <div className="overflow-hidden w-full">
        <div
          className="flex transition-transform duration-250 ease-in-out"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          {slides.map((slide) => (
            <div key={slide.id} className="w-full shrink-0">
              <div className="kpi-grid" style={{ gridTemplateRows: '130px 130px' }}>
                {slide.cards.map((card, ci) => (
                  <KpiCard key={ci} card={card} isMobile={isMobile} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Pills — single row navigation */}
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        {SLIDE_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => goToSlide(i)}
            className={cn(
              'text-[13px] font-medium rounded-full cursor-pointer transition-all duration-200 whitespace-nowrap border',
              activeSlide === i
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
            )}
            style={{ padding: '5px 14px' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Auto-advance progress bar */}
      <div className="flex justify-center mt-2">
        <div className="w-24 h-0.5 rounded-full bg-border overflow-hidden">
          <div
            key={progressKey}
            className="h-full bg-primary rounded-full"
            style={{
              animation: paused ? 'none' : 'slideProgress 5s linear forwards',
            }}
          />
        </div>
      </div>
    </div>
  );
}
