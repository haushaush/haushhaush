import { useState, useEffect } from 'react';
import { Home, Users, ClipboardList, TrendingUp, Target, Euro, UserCircle, Settings, LogOut, ChevronRight, ChevronLeft, Sun, Moon, Bell, Bug } from 'lucide-react';
import { useState as useStateSidebar } from 'react';
import { BugReportModal } from '@/components/BugReportWidget';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import {
  Sidebar, SidebarContent, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: any;
  children?: { title: string; url: string }[];
}

const navItems: NavItem[] = [
  { title: 'Übersicht', url: '/', icon: Home },
  {
    title: 'Kunden', url: '/kunden', icon: Users,
    children: [
      { title: 'Alle Kunden', url: '/kunden' },
      { title: 'Pipeline', url: '/kunden/pipeline' },
      { title: 'Abschlüsse', url: '/kunden/abschluesse' },
      { title: 'Laufzeiten', url: '/kunden/laufzeiten' },
    ],
  },
  {
    title: 'Projekte & Aufgaben', url: '/projekte', icon: ClipboardList,
    children: [
      { title: 'Alle Projekte', url: '/projekte' },
      { title: 'Meine Aufgaben', url: '/projekte/aufgaben' },
    ],
  },
  {
    title: 'Sales', url: '/sales', icon: TrendingUp,
    children: [
      { title: 'KPIs & Leaderboard', url: '/sales/kpis' },
      { title: 'Vorqualifikation', url: '/sales/vorquali' },
      { title: 'Leadkauf', url: '/sales/leads' },
      { title: 'Cold Mail', url: '/sales/coldmail' },
    ],
  },
  {
    title: 'Fulfillment', url: '/fulfillment', icon: Target,
    children: [
      { title: 'Ad Performance', url: '/fulfillment/ads' },
      { title: 'Mediabuying', url: '/fulfillment/mediabuying' },
      { title: 'Customer Success', url: '/fulfillment/customer-success' },
    ],
  },
  {
    title: 'Finanzen', url: '/finanzen', icon: Euro,
    children: [
      { title: 'Übersicht', url: '/finanzen' },
      { title: 'Rechnungen', url: '/finanzen/rechnungen' },
      { title: 'Belege', url: '/finanzen/belege' },
      { title: 'Buchhaltung', url: '/finanzen/buchhaltung' },
    ],
  },
  {
    title: 'Team & HR', url: '/hr', icon: UserCircle,
    children: [
      { title: 'Mitarbeiter', url: '/hr/mitarbeiter' },
      { title: 'Verträge & Gehalt', url: '/hr/vertraege' },
      { title: 'Probewoche', url: '/hr/probewoche' },
      { title: 'Akademie', url: '/hr/akademie' },
      { title: 'Coaching', url: '/hr/coaching' },
      { title: 'Wiki & SOPs', url: '/hr/wiki' },
    ],
  },
];

function loadSidebarState(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('sidebar-state') || '{}'); } catch { return {}; }
}
function saveSidebarState(s: Record<string, boolean>) {
  localStorage.setItem('sidebar-state', JSON.stringify(s));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, isAdminOrManager } = useAuth();
  const { displayName, initials, avatarUrl } = useProfile();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = loadSidebarState();
    const result = { ...saved };
    navItems.forEach(item => {
      if (item.children) {
        const isActive = item.children.some(c => location.pathname === c.url) || location.pathname.startsWith(item.url + '/');
        if (isActive) result[item.title] = true;
      }
    });
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

  const nachrichtenActive = location.pathname === '/nachrichten';

  const renderNavItem = (item: NavItem) => {
    const parentActive = isParentActive(item);

    if (!item.children) {
      const link = (
        <NavLink to={item.url} end className={cn(
          'sidebar-nav-item flex items-center gap-3 rounded-lg text-sm transition-colors min-h-[40px]',
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
          parentActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary' : 'text-muted-foreground hover:bg-muted/60'
        )} aria-current={parentActive ? 'page' : undefined}>
          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
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
              'sidebar-nav-item flex items-center justify-center rounded-lg text-sm transition-colors min-h-[40px] px-0 py-2.5',
              parentActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
            )}>
              <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
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
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-colors min-h-[40px]',
            parentActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
          )}
          aria-expanded={isOpen}
        >
          <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{item.title}</span>
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')} aria-hidden="true" />
        </button>
        <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', isOpen ? 'max-h-96' : 'max-h-0')}>
          <div className="ml-7 border-l border-border pl-3 py-1 space-y-0.5">
            {item.children!.map(child => {
              const childActive = isActive(child.url);
              return (
                <NavLink key={child.url} to={child.url} end={child.url === item.url} className={cn(
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

  const nachrichtenLink = (
    <NavLink to="/nachrichten" className={cn(
      'sidebar-nav-item flex items-center gap-3 rounded-lg text-sm transition-colors min-h-[40px] relative',
      collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
      nachrichtenActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary' : 'text-muted-foreground hover:bg-muted/60'
    )}>
      <div className="relative shrink-0">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadNotifs > 0 && (
          <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground">
            {unreadNotifs > 99 ? '99+' : unreadNotifs}
          </span>
        )}
      </div>
      {!collapsed && <span className="truncate">Nachrichten</span>}
    </NavLink>
  );

  return (
    <Sidebar collapsible="icon" className="hidden md:flex border-r border-border">
      <SidebarContent className="py-4">
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
        <nav className="flex-1 px-2 py-2 space-y-0.5" aria-label="Hauptnavigation">
          {navItems.map(renderNavItem)}
        </nav>

        {/* Collapse/Expand toggle — above footer divider */}
        <div className="px-2 pb-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebar}
                  className="h-9 w-full flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-all duration-150"
                  aria-label="Menü ausklappen"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Menü ausklappen</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={toggleSidebar}
              className="h-9 w-full flex items-center gap-2 px-4 rounded-lg text-muted-foreground hover:bg-accent transition-all duration-150"
              aria-label="Menü einklappen"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="text-xs">Menü einklappen</span>
            </button>
          )}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-3 space-y-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{nachrichtenLink}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Nachrichten{unreadNotifs > 0 ? ` (${unreadNotifs})` : ''}
            </TooltipContent>
          </Tooltip>
        ) : nachrichtenLink}

        {/* Bug Report */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setBugModalOpen(true)}
                className={cn(
                  'sidebar-nav-item flex items-center justify-center rounded-lg text-sm transition-colors min-h-[40px] px-0 py-2.5 w-full',
                  bugModalOpen ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                )}
              >
                <Bug className="h-5 w-5 shrink-0" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Fehler melden</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => setBugModalOpen(true)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[40px] w-full text-left',
              bugModalOpen ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
            )}
          >
            <Bug className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="truncate">Fehler melden</span>
          </button>
        )}


          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink to="/einstellungen" className={cn(
                'sidebar-nav-item flex items-center justify-center rounded-lg text-sm transition-colors min-h-[40px] px-0 py-2.5',
                location.pathname === '/einstellungen' ? 'bg-sidebar-accent text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
              )}>
                <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Einstellungen</TooltipContent>
          </Tooltip>
        ) : (
          <NavLink to="/einstellungen" className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[40px]',
            location.pathname === '/einstellungen' ? 'bg-sidebar-accent text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
          )}>
            <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="truncate">Einstellungen</span>
            {pendingCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 shrink-0">{pendingCount}</span>
            )}
          </NavLink>
        )}

        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col px-0' : 'px-3')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 transition-colors shrink-0"
                aria-label={theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'}
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
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
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Abmelden</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="sm" onClick={signOut}
              className="flex-1 justify-start text-muted-foreground hover:text-destructive min-h-[40px] px-3"
              aria-label="Abmelden">
              <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
              Abmelden
            </Button>
          )}
        </div>
      </SidebarFooter>
      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />
    </Sidebar>
  );
}
