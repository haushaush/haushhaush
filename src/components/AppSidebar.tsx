import { useState, useEffect } from 'react';
import { Home, Users, ClipboardList, TrendingUp, Wand2, Euro, UserCircle, Settings, LogOut, ChevronRight, ChevronLeft, Sun, Moon, Bell, Bug, Sparkles, Briefcase, Facebook, FolderOpen, Workflow, Mail, Globe, BarChart3, Video, MonitorPlay, Wrench, Plug } from 'lucide-react';

import { BugReportModal } from '@/components/BugReportWidget';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import {
  Sidebar, SidebarContent, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: any;
  children?: { title: string; url: string; adminOnly?: boolean }[];
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Übersicht', url: '/', icon: Home },
  {
    title: 'Kunden', url: '/kunden', icon: Users,
    children: [
      { title: 'Übersicht', url: '/kunden' },
      { title: 'Abschlüsse', url: '/kunden/abschluesse' },
      { title: 'Laufzeiten', url: '/kunden/laufzeiten' },
    ],
  },
  {
    title: 'Sales', url: '/sales', icon: TrendingUp,
    children: [
      { title: 'A-KPIs & Leaderboard', url: '/sales/kpis', adminOnly: true },
      { title: 'Vorqualifikation', url: '/sales/vorquali' },
      { title: 'Leadkauf', url: '/sales/leads' },
      { title: 'Cold Mail', url: '/sales/coldmail' },
      { title: 'Referenz Showcase', url: '/sales/referenz-showcase' },
      { title: 'Lead Quality Audit', url: '/tools/lead-quality-audit' },
    ],
  },
  {
    title: 'Projekte & Aufgaben', url: '/projekte', icon: ClipboardList,
    children: [
      { title: 'Projekte', url: '/projekte' },
      { title: 'Aufgaben', url: '/projekte/aufgaben' },
      { title: 'Laufzeit Projekte', url: '/projekte/laufzeiten' },
    ],
  },
  // "Tools" is rendered separately
  {
    title: 'Finanzen', url: '/finanzen', icon: Euro,
    children: [
      { title: 'Übersicht', url: '/finanzen' },
      { title: 'Rechnungen', url: '/finanzen/rechnungen' },
      { title: 'Werbebudgets', url: '/finanzen/werbebudgets' },
    ],
  },
  {
    title: 'Team & HR', url: '/hr', icon: UserCircle,
    children: [
      { title: 'Mitarbeiter', url: '/hr/mitarbeiter' },
      { title: 'Check-in & Check-out', url: '/hr/checkins', adminOnly: true },
    ],
  },
];

// Items that go under the "Tools" expandable category
const toolsNavItems: NavItem[] = [
  { title: 'Integrationen', url: '/integrationen', icon: Plug, adminOnly: true },
  {
    title: 'Close', url: '/close', icon: Briefcase,
    children: [
      { title: 'Leads', url: '/close/leads' },
      { title: 'Deals', url: '/close/deals' },
      { title: 'Verknüpfungen', url: '/close/verknuepfungen' },
    ],
  },
  {
    title: 'Pipedrive', url: '/pipedrive', icon: BarChart3,
    adminOnly: true,
    children: [
      { title: 'Übersicht', url: '/pipedrive/uebersicht' },
      { title: 'Deals', url: '/pipedrive/deals' },
      { title: 'Personen', url: '/pipedrive/personen' },
      { title: 'Pipelines', url: '/pipedrive/pipelines' },
    ],
  },
  {
    title: 'Meta Ads', url: '/meta', icon: Facebook,
    children: [
      { title: 'Übersicht', url: '/meta/uebersicht' },
      { title: 'Ads Manager', url: '/meta/kampagnen' },
      { title: 'Verknüpfungen', url: '/meta/verknuepfungen' },
    ],
  },
  {
    title: 'OnePage Leads', url: '/onepage-leads/kunden', icon: Globe,
    adminOnly: true,
    children: [
      { title: 'Kunden', url: '/onepage-leads/kunden' },
    ],
  },
  {
    title: 'Drive', url: '/drive', icon: FolderOpen,
    children: [
      { title: 'Übersicht', url: '/drive' },
      { title: 'Meine Dateien', url: '/drive/meine-dateien' },
      { title: 'Geteilt mit mir', url: '/drive/geteilt' },
      { title: 'Papierkorb', url: '/drive/papierkorb' },
    ],
  },
  {
    title: 'Email Automatisierung', url: '/email-automatisierung', icon: Workflow,
    adminOnly: true,
    children: [
      { title: 'Posteingang', url: '/email-automatisierung' },
      { title: 'Ungelesen', url: '/email-automatisierung/ungelesen' },
      { title: 'Gesendet', url: '/email-automatisierung/gesendet' },
      { title: 'Wichtig', url: '/email-automatisierung/wichtig' },
      { title: 'Entwürfe', url: '/email-automatisierung/entwuerfe' },
      { title: 'Papierkorb', url: '/email-automatisierung/papierkorb' },
    ],
  },
  { title: 'n8n Workflows', url: '/automationen/n8n', icon: Workflow },
  {
    title: 'A-Ad Creative Studio', url: '/tools/ad-creative-studio', icon: Wand2, adminOnly: true,
  },
];
function loadSidebarState(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('sidebar-state') || '{}'); } catch { return {}; }
}
function saveSidebarState(s: Record<string, boolean>) {
  localStorage.setItem('sidebar-state', JSON.stringify(s));
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, isAdminOrManager, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const filterByPermission = (item: NavItem) => {
    if (item.adminOnly) return isAdmin;
    if (item.url.startsWith('/onepage-leads')) return isAdmin;
    return true;
  };
  const visibleNavItems = navItems.filter(filterByPermission);
  const visibleToolsItems = toolsNavItems.filter(filterByPermission);
  const { displayName, initials, avatarUrl } = useProfile();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [pipedriveAccounts, setPipedriveAccounts] = useState<{ id: string; name: string; color_hex: string | null }[]>([]);
  const [activePipedriveId, setActivePipedriveId] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('pipedrive-active-account') : null)
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = loadSidebarState();
    const result = { ...saved };
    const allItems = [...navItems, ...toolsNavItems];
    allItems.forEach(item => {
      if (item.children) {
        const isActive = item.children.some(c => location.pathname === c.url) || location.pathname.startsWith(item.url + '/');
        if (isActive) result[item.title] = true;
      }
    });
    // Auto-open Tools category if any tool item is active
    const anyToolActive = toolsNavItems.some(t =>
      location.pathname.startsWith(t.url + '/') || location.pathname === t.url ||
      t.children?.some(c => location.pathname === c.url)
    );
    if (anyToolActive) result['__tools'] = true;
    return result;
  });

  useEffect(() => { saveSidebarState(openGroups); }, [openGroups]);

  useEffect(() => {
    if (!isAdminOrManager) return;
    const fetch = async () => {
      const { count } = await supabase.from('employee_requests').select('*', { count: 'exact', head: true }).eq('status', 'Ausstehend');
      setPendingCount(count || 0);
    };
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [isAdminOrManager]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .eq('archived', false);
      setUnreadNotifs(count || 0);
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    const channel = supabase
      .channel(`sidebar-notif-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Load Pipedrive accounts (for sidebar account switcher)
  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from('pipedrive_accounts' as any)
        .select('id, name, color_hex')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (!mounted) return;
      const list = ((data ?? []) as any[]) as { id: string; name: string; color_hex: string | null }[];
      setPipedriveAccounts(list);
      setActivePipedriveId(prev => {
        if (prev && list.some(a => a.id === prev)) return prev;
        return list[0]?.id || null;
      });
    };
    load();
    const ch = supabase
      .channel('sidebar-pipedrive-accounts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipedrive_accounts' }, load)
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);


  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const isActive = (url: string) => {
    if (url === '/') return location.pathname === '/';
    return location.pathname === url;
  };

  const isParentActive = (item: NavItem) => {
    if (!item.children) return isActive(item.url);
    return item.children.some(c => isActive(c.url)) || location.pathname.startsWith(item.url + '/');
  };

  const nachrichtenActive = location.pathname === '/nachrichten' || (location.pathname.startsWith('/email') && !location.pathname.startsWith('/email-automatisierung'));
  const ariaActive = location.pathname === '/aria' || location.pathname === '/automationen/aria';
  const n8nActive = location.pathname === '/automationen/n8n';
  const automationenGroupActive = ariaActive;
  const einstellungenActive = location.pathname === '/einstellungen';
  const automationenOpen = openGroups['__automationen'] ?? automationenGroupActive;
  const toolsOpen = openGroups['__tools'] ?? false;
  const anyToolActive = visibleToolsItems.some(t => isParentActive(t));

  // Split navItems: items before Fulfillment = top group, Fulfillment onwards = bottom group
  const toolsInsertIndex = visibleNavItems.findIndex(i => i.title === 'Fulfillment');
  const navItemsBefore = toolsInsertIndex >= 0 ? visibleNavItems.slice(0, toolsInsertIndex) : visibleNavItems;
  const navItemsAfter = toolsInsertIndex >= 0 ? visibleNavItems.slice(toolsInsertIndex) : [];

  // ─── LEVEL 1: Primary nav item renderer ───
  const renderNavItem = (item: NavItem) => {
    const parentActive = isParentActive(item);

    if (!item.children) {
      const link = (
        <NavLink to={item.url} end className={cn(
          'sidebar-nav-item flex items-center gap-3 rounded-lg transition-colors',
          collapsed ? 'justify-center px-0 py-2.5 min-h-[40px]' : 'px-3 py-[9px] min-h-[40px]',
          'text-[14px] font-medium',
          parentActive ? 'bg-sidebar-accent text-primary border-l-[3px] border-primary' : 'text-foreground hover:bg-muted/60'
        )} aria-current={parentActive ? 'page' : undefined}>
          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.title}</span>}
        </NavLink>
      );

      if (collapsed) {
        return (
          <Tooltip key={item.title}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{item.title}</TooltipContent>
          </Tooltip>
        );
      }
      return <div key={item.title}>{link}</div>;
    }

    const isOpen = openGroups[item.title] ?? false;

    if (collapsed) {
      return (
        <Tooltip key={item.title}>
          <TooltipTrigger asChild>
            <NavLink to={item.url} className={cn(
              'sidebar-nav-item flex items-center justify-center rounded-lg transition-colors min-h-[40px] px-0 py-2.5',
              'text-[14px] font-medium',
              parentActive ? 'text-primary' : 'text-foreground hover:bg-muted/60'
            )}>
              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{item.title}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={item.title}>
        <button
          onClick={() => toggleGroup(item.title)}
          className={cn(
            'flex items-center gap-3 px-3 py-[9px] rounded-lg w-full text-left transition-colors min-h-[40px]',
            'text-[14px] font-medium',
            parentActive ? 'text-primary' : 'text-foreground hover:bg-muted/60'
          )}
          aria-expanded={isOpen}
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{item.title}</span>
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')} aria-hidden="true" />
        </button>
        <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', isOpen ? 'max-h-[28rem]' : 'max-h-0')}>
          <div className="ml-7 border-l border-border pl-3 py-1 space-y-0.5">
            {item.title === 'Pipedrive' && (
              <div className="px-1 pb-2">
                {pipedriveAccounts.length === 0 ? (
                  <NavLink
                    to="/einstellungen?tab=integrationen"
                    className="block text-[11px] text-muted-foreground hover:text-foreground italic px-2 py-1.5 rounded border border-dashed border-border"
                  >
                    Kein Konto verbunden →
                  </NavLink>
                ) : (
                  <select
                    value={activePipedriveId || ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      setActivePipedriveId(id);
                      localStorage.setItem('pipedrive-active-account', id);
                      if (location.pathname.startsWith('/pipedrive')) {
                        navigate(`${location.pathname}?account=${id}`);
                      }
                    }}
                    className="w-full text-[11px] bg-muted text-foreground rounded px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Pipedrive Account auswählen"
                  >
                    {pipedriveAccounts.map(a => (
                      <option key={a.id} value={a.id}>● {a.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {item.children!.filter(c => !c.adminOnly || isAdmin).map(child => {
              const childActive = isActive(child.url);
              const isPipedriveChild = item.title === 'Pipedrive';
              const href = isPipedriveChild && activePipedriveId
                ? `${child.url}?account=${activePipedriveId}`
                : child.url;
              return (
                <NavLink key={child.url} to={href} end={child.url === item.url} className={cn(
                  'block px-3 py-2 rounded-md text-sm transition-colors min-h-[36px] truncate',
                  childActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary -ml-[calc(0.75rem+1px)] pl-[calc(0.75rem+1px)]' : 'text-muted-foreground hover:bg-muted/60'
                )} aria-current={childActive ? 'page' : undefined}>
                  {child.title}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ─── Helper: Level 2 item ───
  const renderLevel2 = (to: string, icon: React.ReactNode, label: string, active: boolean, badge?: number) => {
    const link = (
      <NavLink to={to} className={cn(
        'sidebar-nav-item flex items-center gap-3 rounded-lg transition-colors relative',
        collapsed ? 'justify-center px-0 py-2 min-h-[36px]' : 'px-3 py-2 min-h-[36px]',
        'text-[13px] font-normal',
        active ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary' : 'text-muted-foreground hover:bg-muted/60'
      )}>
        <div className="relative shrink-0">
          {icon}
          {badge != null && badge > 0 && (
            <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center h-[16px] min-w-[16px] px-1 text-[9px] font-semibold rounded-full bg-destructive text-destructive-foreground">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </div>
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{label}{badge ? ` (${badge})` : ''}</TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  // ─── Helper: Level 3 item ───
  const renderLevel3 = (content: React.ReactNode, onClick?: () => void, to?: string, active?: boolean, badge?: number) => {
    const cls = cn(
      'flex items-center gap-2.5 rounded-lg transition-colors w-full text-left',
      collapsed ? 'justify-center px-0 py-1.5 min-h-[32px]' : 'px-3 py-[6px] min-h-[32px]',
      'text-[12px] font-normal',
      active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    );

    if (to) {
      const link = (
        <NavLink to={to} className={cls}>
          {content}
        </NavLink>
      );
      if (collapsed) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {typeof content === 'string' ? content : to}
              {badge ? ` (${badge})` : ''}
            </TooltipContent>
          </Tooltip>
        );
      }
      return link;
    }

    const btn = (
      <button onClick={onClick} className={cls}>
        {content}
      </button>
    );
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {typeof content === 'string' ? content : 'Aktion'}
          </TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  };

  return (
    <Sidebar collapsible="icon" className="hidden md:flex border-r border-border">
      <SidebarContent className="py-4 flex flex-col h-full">
        {/* User Profile Header */}
        <div className="px-3 pb-3 border-b border-border">
          {!collapsed ? (
            <button
              onClick={() => navigate('/profil')}
              className="group/profile flex items-center gap-3 w-full rounded-[10px] px-3 py-3 cursor-pointer transition-colors duration-150 hover:bg-muted/60 text-left"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-px group-hover/profile:text-primary transition-colors">Profil bearbeiten →</p>
              </div>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/profil')}
                  className="flex justify-center w-full py-2 cursor-pointer rounded-[10px] transition-colors duration-150 hover:bg-muted/60"
                >
                  <Avatar className="h-9 w-9">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">{displayName} — Profil bearbeiten</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* ─── LEVEL 1: Primary Navigation ─── */}
        <nav className="flex-1 px-2 py-2 space-y-0.5" aria-label="Hauptnavigation">
          {navItemsBefore.map(renderNavItem)}

          {/* ─── Tools Category ─── */}
          {visibleToolsItems.length > 0 && (
            collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to={visibleToolsItems[0].url}
                    className={cn(
                      'sidebar-nav-item flex items-center justify-center rounded-lg transition-colors min-h-[40px] px-0 py-2.5',
                      'text-[14px] font-medium',
                      anyToolActive ? 'text-primary' : 'text-foreground hover:bg-muted/60'
                    )}
                  >
                    <Wrench className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Connections</TooltipContent>
              </Tooltip>
            ) : (
              <div>
                <button
                  onClick={() => setOpenGroups(p => ({ ...p, __tools: !toolsOpen }))}
                  className={cn(
                    'flex items-center gap-3 px-3 py-[9px] rounded-lg w-full text-left transition-colors min-h-[40px]',
                    'text-[14px] font-medium',
                    anyToolActive ? 'text-primary' : 'text-foreground hover:bg-muted/60'
                  )}
                  aria-expanded={toolsOpen}
                >
                  <Wrench className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">Connections</span>
                  <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', toolsOpen && 'rotate-90')} aria-hidden="true" />
                </button>
                <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', toolsOpen ? 'max-h-[80rem]' : 'max-h-0')}>
                  <div className="ml-7 border-l border-border pl-1 py-1 space-y-0.5">
                    {visibleToolsItems.map(toolItem => {
                      const toolActive = isParentActive(toolItem);
                      const toolOpen = openGroups[toolItem.title] ?? false;

                      if (!toolItem.children) {
                        return (
                          <NavLink key={toolItem.title} to={toolItem.url} end className={cn(
                            'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors min-h-[34px] truncate',
                            toolActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary -ml-[calc(0.25rem+1px)] pl-[calc(0.75rem+1px)]' : 'text-muted-foreground hover:bg-muted/60'
                          )}>
                            <toolItem.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{toolItem.title}</span>
                          </NavLink>
                        );
                      }

                      return (
                        <div key={toolItem.title}>
                          <button
                            onClick={() => toggleGroup(toolItem.title)}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2 rounded-md w-full text-left transition-colors min-h-[34px]',
                              'text-[13px]',
                              toolActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
                            )}
                            aria-expanded={toolOpen}
                          >
                            <toolItem.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="flex-1 truncate">{toolItem.title}</span>
                            <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform duration-200', toolOpen && 'rotate-90')} aria-hidden="true" />
                          </button>
                          <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', toolOpen ? 'max-h-[28rem]' : 'max-h-0')}>
                            <div className="ml-6 border-l border-border pl-2 py-0.5 space-y-0.5">
                              {toolItem.title === 'Pipedrive' && (
                                <div className="px-1 pb-2">
                                  {pipedriveAccounts.length === 0 ? (
                                    <NavLink
                                      to="/einstellungen?tab=integrationen"
                                      className="block text-[11px] text-muted-foreground hover:text-foreground italic px-2 py-1.5 rounded border border-dashed border-border"
                                    >
                                      Kein Konto verbunden →
                                    </NavLink>
                                  ) : (
                                    <select
                                      value={activePipedriveId || ''}
                                      onChange={(e) => {
                                        const id = e.target.value;
                                        setActivePipedriveId(id);
                                        localStorage.setItem('pipedrive-active-account', id);
                                        if (location.pathname.startsWith('/pipedrive')) {
                                          navigate(`${location.pathname}?account=${id}`);
                                        }
                                      }}
                                      className="w-full text-[11px] bg-muted text-foreground rounded px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                                      aria-label="Pipedrive Account auswählen"
                                    >
                                      {pipedriveAccounts.map(a => (
                                        <option key={a.id} value={a.id}>● {a.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              )}
                              {toolItem.children!.map(child => {
                                const childActive = isActive(child.url);
                                const isPipedriveChild = toolItem.title === 'Pipedrive';
                                const href = isPipedriveChild && activePipedriveId
                                  ? `${child.url}?account=${activePipedriveId}`
                                  : child.url;
                                return (
                                  <NavLink key={child.url} to={href} end={child.url === toolItem.url} className={cn(
                                    'block px-3 py-1.5 rounded-md text-[12px] transition-colors min-h-[30px] truncate',
                                    childActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary -ml-[calc(0.5rem+1px)] pl-[calc(0.75rem+1px)]' : 'text-muted-foreground hover:bg-muted/60'
                                  )} aria-current={childActive ? 'page' : undefined}>
                                    {child.title}
                                  </NavLink>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          )}

          {navItemsAfter.map(renderNavItem)}
        </nav>

        {/* ─── LEVEL 2: Secondary Navigation ─── */}
        <div className="px-2 mt-2 space-y-0.5">
          {renderLevel2('/nachrichten', <Bell className="h-4 w-4" aria-hidden="true" />, 'Nachrichten', nachrichtenActive, unreadNotifs)}

          {/* ARIA & Automationen — expandable group */}
          {(() => {
            const automationenItems = [
              { to: '/automationen/aria', label: 'A-ARIA', icon: Sparkles, active: ariaActive, adminOnly: true },
            ].filter(c => !c.adminOnly || isAdmin);
            if (automationenItems.length === 0) return null;
            return collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/automationen/aria"
                    className={cn(
                      'sidebar-nav-item flex items-center justify-center rounded-lg transition-colors min-h-[36px] px-0 py-2',
                      'text-[13px] font-normal',
                      automationenGroupActive ? 'text-primary' : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">ARIA & Automationen</TooltipContent>
              </Tooltip>
            ) : (
              <div>
                <button
                  onClick={() => setOpenGroups((p) => ({ ...p, __automationen: !automationenOpen }))}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-colors min-h-[36px]',
                    'text-[13px] font-normal',
                    automationenGroupActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
                  )}
                  aria-expanded={automationenOpen}
                >
                  <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">ARIA & Automationen</span>
                  <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', automationenOpen && 'rotate-90')} aria-hidden="true" />
                </button>
                <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', automationenOpen ? 'max-h-96' : 'max-h-0')}>
                  <div className="ml-7 border-l border-border pl-3 py-1 space-y-0.5">
                    {automationenItems.map((c) => (
                      <NavLink
                        key={c.to}
                        to={c.to}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors min-h-[36px] truncate',
                          c.active
                            ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary -ml-[calc(0.75rem+1px)] pl-[calc(0.75rem+1px)]'
                            : 'text-muted-foreground hover:bg-muted/60'
                        )}
                      >
                        <c.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{c.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ─── Thin divider ─── */}
        <div className="px-4 my-1">
          <div className="border-t border-border/50" style={{ borderTopWidth: '0.5px' }} />
        </div>

        {/* ─── LEVEL 3: Utility ─── */}
        <div className="px-2 space-y-[2px]">
          {renderLevel3(
            <>
              <Bug className={cn('shrink-0', collapsed ? 'h-[15px] w-[15px] opacity-60' : 'h-[15px] w-[15px]')} aria-hidden="true" />
              {!collapsed && <span className="truncate">Fehler melden</span>}
            </>,
            () => setBugModalOpen(true)
          )}
          {renderLevel3(
            <>
              <Settings className={cn('shrink-0', collapsed ? 'h-[15px] w-[15px] opacity-60' : 'h-[15px] w-[15px]')} aria-hidden="true" />
              {!collapsed && (
                <span className="truncate flex-1">Einstellungen</span>
              )}
              {!collapsed && pendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1 shrink-0">{pendingCount}</span>
              )}
            </>,
            undefined,
            '/einstellungen',
            einstellungenActive,
            pendingCount
          )}
          {renderLevel3(
            <>
              {collapsed
                ? <ChevronRight className="h-[15px] w-[15px] opacity-60 shrink-0" />
                : <ChevronLeft className="h-[15px] w-[15px] shrink-0" />
              }
              {!collapsed && <span className="truncate">Menü einklappen</span>}
            </>,
            toggleSidebar
          )}
        </div>

        {/* ─── Thin divider ─── */}
        <div className="px-4 my-1">
          <div className="border-t border-border/50" style={{ borderTopWidth: '0.5px' }} />
        </div>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'px-1')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className={cn(
                  'flex items-center justify-center rounded-lg transition-colors shrink-0',
                  collapsed ? 'h-8 w-8' : 'h-7 w-7',
                  'text-[12px] text-muted-foreground hover:text-foreground'
                )}
                aria-label={theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'}
              >
                {theme === 'light' ? <Moon className="h-[15px] w-[15px]" /> : <Sun className="h-[15px] w-[15px]" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </TooltipContent>
          </Tooltip>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  aria-label="Abmelden"
                >
                  <LogOut className="h-[15px] w-[15px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Abmelden</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={signOut}
              className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:text-destructive transition-colors text-left"
              aria-label="Abmelden"
            >
              <LogOut className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
              <span>Abmelden</span>
            </button>
          )}
        </div>
      </SidebarFooter>
      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />
    </Sidebar>
  );
}
