import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, TrendingUp, Users, Target, Trophy, Clock, Zap, Phone, CalendarCheck, BarChart3, Mail, FolderOpen, ListTodo, Activity, DollarSign, Wallet, CreditCard, Receipt, AlertTriangle, UserCircle, GraduationCap, UserPlus, Calendar, Star, ArrowUpRight, ArrowDownRight, CheckSquare, Timer, AlertCircle, BarChart2, Gem, BookOpen } from 'lucide-react';
import { formatValue } from '@/lib/utils';
import { cn } from '@/lib/utils';

import type { Rechnung } from '@/lib/rechnungen';
import type { EffizienzResult, QuellenZustand, RevenueData } from '@/hooks/useDataSources';

/** Ohne Messwert: statt einer Zahl wird ein Zustandstext gezeigt – nie „0 €“ für „nicht gemessen“. */
type KartenZustand = { text: string; ton: 'leer' | 'fehler' | 'laedt' };

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
  zustand?: KartenZustand;
}

interface SlideData {
  id: string;
  label: string;
  cards: KpiCardData[];
}

interface KpiSliderProps {
  deals: any[];
  invoices: Rechnung[];
  invoicesZustand: QuellenZustand;
  revenue: RevenueData;
  cashCollect: { summe: number; anzahl: number; zustand: QuellenZustand };
  salesPerf: any[];
  salesPerfMonth: any[];
  team: any[];
  tasks: any[];
  effizienz: EffizienzResult;
  isMobile: boolean;
  qonto: { accounts: any[]; total_balance: number; zustand: QuellenZustand };
  metaTotals: { spend: number; leads: number; cpl: number | null; lastSync: string | null; zustand: QuellenZustand };
}

const LEER_TEXT: Record<Exclude<QuellenZustand, 'ok'>, KartenZustand> = {
  laedt: { text: 'lädt …', ton: 'laedt' },
  leer: { text: 'keine Daten', ton: 'leer' },
  fehler: { text: 'Fehler beim Laden', ton: 'fehler' },
};
const kartenZustand = (z: QuellenZustand, leerText?: string): KartenZustand | undefined =>
  z === 'ok' ? undefined : z === 'leer' && leerText ? { text: leerText, ton: 'leer' } : LEER_TEXT[z];

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
      className="cursor-pointer card-interactive group rounded-[14px] overflow-hidden min-w-0 h-[140px] min-h-[140px] max-h-[140px]"
      onClick={() => navigate(card.href)}
    >
      <CardContent className="px-4 py-3.5 h-full flex flex-col justify-start gap-1">
        <div className="flex items-start justify-between gap-1">
          <p className="kpi-label text-muted-foreground truncate">{card.label}</p>
          <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
        {card.zustand
          ? <p className={cn('text-sm font-medium leading-tight py-1', card.zustand.ton === 'fehler' ? 'text-destructive' : 'text-muted-foreground')}>{card.zustand.text}</p>
          : <p className={cn('text-[clamp(16px,2vw,22px)] font-bold leading-tight', valueColor)}>{card.value}</p>}
        <p className="text-[11px] text-muted-foreground line-clamp-1">{card.subtext}</p>
        {card.badge && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive whitespace-nowrap truncate max-w-full">
            {card.badge}
          </span>
        )}
        {card.trend !== undefined && card.trend !== null && !card.zustand && (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[10px] font-medium mt-0.5 px-1.5 py-0.5 rounded-full',
            card.trend >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'
          )}>
            {card.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {card.trend >= 0 ? '+' : ''}{card.trend.toFixed(1)}%
          </span>
        )}
        {card.gauge !== undefined && !card.zustand && (
          <svg width="40" height="22" viewBox="0 0 48 28" className="mt-0.5" aria-hidden="true">
            <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke="hsl(var(--border))" strokeWidth="3" strokeLinecap="round" />
            <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke={card.color === 'green' ? 'hsl(var(--primary))' : card.color === 'orange' ? '#FF9F0A' : '#FF3B30'} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(card.gauge / 100) * 62.8} 62.8`} />
          </svg>
        )}
      </CardContent>
    </Card>
  );
}

export function KpiSlider({ deals, invoices, invoicesZustand, revenue, cashCollect, salesPerf, salesPerfMonth, team, tasks, effizienz, isMobile, qonto, metaTotals }: KpiSliderProps) {
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

    // === RECHNUNGEN (Qonto + lexoffice, Status aus src/lib/rechnungen.ts) ===
    const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
    const bezahltIm = (key: string) => invoices.filter(i => i.status === 'bezahlt' && i.paid?.startsWith(key)).reduce((s, i) => s + i.amount, 0);
    const umsatzThisMonth = bezahltIm(ym(currentYear, currentMonth));
    const umsatzLastMonth = bezahltIm(ym(lastMonthYear, lastMonth));
    const umsatzTrend = umsatzLastMonth > 0 ? ((umsatzThisMonth - umsatzLastMonth) / umsatzLastMonth * 100) : null;
    const rz = kartenZustand(invoicesZustand);

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

    const openInvs = invoices.filter(i => i.status === 'offen' || i.status === 'überfällig');
    const openTotal = openInvs.reduce((s, i) => s + i.amount, 0);
    const overdueCount = openInvs.filter(i => i.status === 'überfällig').length;

    // Cash Collect: einzige Definition im Bonus-Modell (bonus_cash_collect, zugeordnet, laufender Monat).
    const ccZ = kartenZustand(cashCollect.zustand);
    const ccCard: KpiCardData = { label: 'CASH COLLECT', value: fmtC(cashCollect.summe), subtext: `${cashCollect.anzahl} Zahlungen im ${monthName} (Bonus-Modell)`, icon: Receipt, href: '/bonus', zustand: ccZ };

    const effZ: KartenZustand | undefined = effizienz.loading ? LEER_TEXT.laedt : effizienz.error ? LEER_TEXT.fehler : effizienz.score === null ? { text: 'nicht berechenbar', ton: 'leer' } : undefined;
    const effScore = effizienz.score ?? 0;
    const effColor = effScore >= 80 ? 'green' : effScore >= 60 ? 'orange' : 'red';
    const pct = (v: number | null) => v === null ? 'k. A.' : `${v}%`;

    const mrrZ = kartenZustand(revenue.zustand);
    const qZ = kartenZustand(qonto.zustand);
    const metaZ = kartenZustand(metaTotals.zustand, 'Sync nicht eingerichtet');

    const openTasks = tasks.filter(t => t.status === 'Offen').length;
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'Erledigt').length;

    // === SLIDE 0: FINANCE LIVE ===
    const slideLive: SlideData = {
      id: 'finance-live', label: '💶 Finance Live',
      cards: [
        {
          label: 'Kontostand Gesamt',
          value: `€${qonto.total_balance.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          subtext: `${qonto.accounts.length} Qonto-Konten`,
          icon: Wallet,
          href: '/finanzen/qonto',
          color: qonto.total_balance > 5000 ? 'green' : qonto.total_balance > 1000 ? 'orange' : 'red',
          zustand: qZ,
        },
        {
          label: 'Meta Spend (30d)',
          value: `€${metaTotals.spend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`,
          subtext: `${metaTotals.leads} Leads generiert`,
          icon: Target,
          href: '/finanzen/werbebudgets',
          color: 'default',
          zustand: metaZ,
        },
        {
          label: 'Ø CPL (30d)',
          value: metaTotals.cpl === null ? '–' : `€${metaTotals.cpl.toFixed(2)}`,
          subtext: metaTotals.cpl === null ? 'Keine Leads im Zeitraum' : 'Cost per Lead Meta',
          icon: TrendingUp,
          href: '/finanzen/werbebudgets',
          color: metaTotals.cpl === null ? 'default' : metaTotals.cpl < 20 ? 'green' : metaTotals.cpl < 40 ? 'orange' : 'red',
          zustand: metaZ,
        },
        { label: 'UMSATZ', value: fmtC(umsatzThisMonth), subtext: `Bezahlt im ${monthName}`, icon: TrendingUp, href: '/finanzen/rechnungen', trend: umsatzTrend, zustand: rz },
        { label: 'OFFENE RECHNUNGEN', value: fmtC(openTotal), subtext: `${openInvs.length} Rechnungen offen`, icon: Clock, href: '/finanzen/rechnungen', badge: overdueCount > 0 ? `⚠ ${overdueCount} überfällig` : undefined, badgeColor: 'destructive', zustand: rz },
        { label: 'MRR', value: fmtC(revenue.mrr), subtext: `${revenue.aktiv} aktive Verträge${revenue.ohneWert ? ` · ${revenue.ohneWert} ohne Wert/Laufzeit` : ''}`, icon: DollarSign, href: '/kunden/laufzeiten', zustand: mrrZ },
        ccCard,
        { label: 'EFFIZIENZ', value: String(effScore), subtext: `Deadlines ${pct(effizienz.scoreA)}`, icon: Zap, href: '/projekte', gauge: effScore, color: effColor, zustand: effZ },
      ],
    };

    const slide1: SlideData = {
      id: 'uebersicht', label: 'Übersicht',
      cards: [
        { label: 'UMSATZ', value: fmtC(umsatzThisMonth), subtext: `Bezahlt im ${monthName}`, icon: TrendingUp, href: '/finanzen/rechnungen', trend: umsatzTrend, zustand: rz },
        { label: 'AKTIVE KUNDEN', value: String(activeClients), subtext: `${neukunden} Neukunden diesen Monat`, icon: Users, href: '/kunden' },
        { label: 'ABSCHLÜSSE WOCHE', value: String(weekDeals.length), subtext: `${fmtC(weekVolume)} Volumen`, icon: Target, href: '/kunden/abschluesse' },
        { label: 'TOP SETTER', value: topSeller?.name || '–', subtext: topSeller ? `${fmtC(topSeller.revenue)} · ${topSeller.closes} Abschlüsse` : 'Keine Daten', icon: Trophy, href: '/sales/kpis' },
        { label: 'OFFENE RECHNUNGEN', value: fmtC(openTotal), subtext: `${openInvs.length} Rechnungen offen`, icon: Clock, href: '/finanzen/rechnungen', badge: overdueCount > 0 ? `⚠ ${overdueCount} überfällig` : undefined, badgeColor: 'destructive', zustand: rz },
        { label: 'EFFIZIENZ', value: String(effScore), subtext: `Deadlines ${pct(effizienz.scoreA)} · Tickets ${pct(effizienz.scoreB)}`, icon: Zap, href: '/projekte', gauge: effScore, color: effColor, zustand: effZ },
        { ...ccCard, icon: Wallet },
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
        { label: 'Ø EFFIZIENZ', value: `${effScore}%`, subtext: 'Deadlines, Aufgaben, Laufzeitstart', icon: Activity, href: '/projekte', color: effColor, zustand: effZ },
        { label: 'CPL INTERN', value: '–', subtext: 'Cost per Lead intern', icon: DollarSign, href: '/finanzen/werbebudgets' },
        { label: 'AD SPEND KUNDEN', value: '–', subtext: '€ in Kundenaccounts', icon: Wallet, href: '/finanzen/werbebudgets' },
        { label: 'AMPEL ROT', value: String(redAmpel), subtext: 'Kunden mit Handlungsbedarf', icon: AlertTriangle, href: '/kunden', color: redAmpel > 0 ? 'red' : 'green' },
        { label: 'ÜBERFÄLLIGE AUFGABEN', value: String(overdueTasks), subtext: overdueTasks > 0 ? 'Sofort handeln' : 'Keine überfällig', icon: AlertCircle, href: '/projekte/aufgaben', color: overdueTasks > 0 ? 'red' : 'green' },
        { label: 'MEETINGS WOCHE', value: '–', subtext: 'Kundenmeetings', icon: Calendar, href: '/kunden' },
      ],
    };

    // === SLIDE 4: FINANZEN ===
    const mrr = revenue.mrr;
    const arr = mrr * 12;
    const paidThisMonth = umsatzThisMonth;
    const overdueInvs = invoices.filter(i => i.status === 'überfällig');
    const overdueSum = overdueInvs.reduce((s, i) => s + i.amount, 0);
    const clvTotal = deals.filter(d => d.status === 'Aktiv').reduce((s, d) => s + Number(d.wert_eur || 0), 0);

    const slide4: SlideData = {
      id: 'finanzen', label: 'Finanzen',
      cards: [
        { label: 'MRR', value: fmtC(mrr), subtext: `${revenue.aktiv} aktive Verträge`, icon: TrendingUp, href: '/kunden/laufzeiten', zustand: mrrZ },
        { label: 'ARR', value: fmtC(arr), subtext: 'Hochrechnung auf 12 Monate', icon: TrendingUp, href: '/kunden/laufzeiten', zustand: mrrZ },
        { ...ccCard, icon: CreditCard },
        { label: 'BEZAHLT', value: fmtC(paidThisMonth), subtext: 'Bereits eingegangen', icon: Receipt, href: '/finanzen/rechnungen', color: 'green', zustand: rz },
        { label: 'ÜBERFÄLLIG', value: String(overdueInvs.length), subtext: fmtC(overdueSum), icon: AlertTriangle, href: '/finanzen/rechnungen', color: overdueInvs.length > 0 ? 'red' : 'green', zustand: rz },
        { label: 'QONTO', value: fmtC(qonto.total_balance), subtext: `${qonto.accounts.length} Konten`, icon: Wallet, href: '/finanzen/qonto', zustand: qZ },
        { label: 'UMSATZ VORMONAT', value: fmtC(umsatzLastMonth), subtext: 'Vormonat zum Vergleich', icon: BarChart2, href: '/finanzen/rechnungen', zustand: rz },
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
        { label: 'AKADEMIE', value: '–', subtext: 'Vertriebsakademie', icon: GraduationCap, href: '/hr/mitarbeiter' },
        { label: 'HR-ANFRAGEN', value: '–', subtext: 'Mitarbeiter-Anfragen', icon: UserPlus, href: '/einstellungen' },
        { label: 'PROBEWOCHEN', value: '–', subtext: 'Aktuelle Probewochen', icon: Calendar, href: '/hr/mitarbeiter' },
        { label: 'COACHING', value: '–', subtext: 'Diesen Monat', icon: Phone, href: '/hr/mitarbeiter' },
        { label: 'Ø COACHING SCORE', value: '–', subtext: 'Aus 0 Sessions', icon: Star, href: '/hr/mitarbeiter' },
        { label: 'WIKI SEITEN', value: '–', subtext: 'SOPs & Prozesse', icon: BookOpen, href: '/hr/mitarbeiter' },
        { label: 'ZEIT HEUTE', value: '–', subtext: 'Deine Zeit heute', icon: Timer, href: '/hr/time-tracking' },
      ],
    };

    return [slideLive, slide1, slide2, slide3, slide4, slide5];
  }, [deals, invoices, invoicesZustand, cashCollect, revenue, salesPerf, salesPerfMonth, team, tasks, effizienz, isMobile, currentMonth, currentYear, qonto, metaTotals]);

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
              <div className="kpi-grid" style={{ gridTemplateRows: '140px 140px' }}>
                {slide.cards.map((card, ci) => (
                  <KpiCard key={ci} card={card} isMobile={isMobile} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation: Prev + Tab Pills + Next */}
      <div className="flex items-center justify-center gap-2.5 mt-4 flex-wrap">
        {/* Prev */}
        <button
          onClick={prevSlide}
          className={cn(
            'h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center shrink-0 transition-all duration-150',
            activeSlide === 0
              ? 'opacity-30 cursor-default'
              : 'text-muted-foreground hover:border-primary hover:text-primary cursor-pointer'
          )}
          disabled={activeSlide === 0}
          aria-label="Vorherige Slide"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Tab Pills */}
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
            style={{ padding: '4px 12px' }}
          >
            {label}
          </button>
        ))}

        {/* Next */}
        <button
          onClick={nextSlide}
          className={cn(
            'h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center shrink-0 transition-all duration-150',
            activeSlide === totalSlides - 1
              ? 'opacity-30 cursor-default'
              : 'text-muted-foreground hover:border-primary hover:text-primary cursor-pointer'
          )}
          disabled={activeSlide === totalSlides - 1}
          aria-label="Nächste Slide"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
