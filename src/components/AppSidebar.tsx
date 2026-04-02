import { useState, useEffect } from 'react';
import { Home, Users, ClipboardList, TrendingUp, Target, Euro, UserCircle, Settings, LogOut, ChevronRight, Sun, Moon, Bell } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar, SidebarContent, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user, isAdminOrManager } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
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

  // Fetch pending employee requests count
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

  // Fetch unread notification count
  useEffect(() => {
    if (!user) return;
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

    // Realtime updates
    const channel = supabase
      .channel('sidebar-notif-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        fetchCount();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user]);

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

  return (
    <Sidebar collapsible="icon" className="hidden md:flex border-r border-border">
      <SidebarContent className="py-4">
        <div className="px-4 pb-4 border-b border-border">
          {!collapsed ? (
            <div>
              <h2 className="text-sm font-semibold text-foreground">Haush Haush Dashboard</h2>
              <p className="text-xs text-muted-foreground">Viral Connect · Haush Haush</p>
            </div>
          ) : (
            <span className="text-primary font-bold text-lg" aria-label="Dashboard">H</span>
          )}
        </div>
        <nav className="flex-1 px-2 py-2 space-y-0.5" aria-label="Hauptnavigation">
          {navItems.map(item => {
            const parentActive = isParentActive(item);
            const isOpen = openGroups[item.title] ?? false;

            if (!item.children) {
              return (
                <NavLink key={item.title} to={item.url} end className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[40px]',
                  parentActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary' : 'text-muted-foreground hover:bg-muted/60'
                )} aria-current={parentActive ? 'page' : undefined}>
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
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
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.title}</span>
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-200', isOpen && 'rotate-90')} aria-hidden="true" />
                    </>
                  )}
                </button>
                {!collapsed && (
                  <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', isOpen ? 'max-h-96' : 'max-h-0')}>
                    <div className="ml-7 border-l border-border pl-3 py-1 space-y-0.5">
                      {item.children.map(child => {
                        const childActive = isActive(child.url);
                        return (
                          <NavLink key={child.url} to={child.url} end={child.url === item.url} className={cn(
                            'block px-3 py-2 rounded-md text-sm transition-colors min-h-[36px]',
                            childActive ? 'bg-sidebar-accent text-primary font-medium border-l-[3px] border-primary -ml-[calc(0.75rem+1px)]  pl-[calc(0.75rem+1px)]' : 'text-muted-foreground hover:bg-muted/60'
                          )} aria-current={childActive ? 'page' : undefined}>
                            {child.title}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-3 space-y-2">
        {/* Nachrichten */}
        <NavLink to="/nachrichten" className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[40px] relative',
          nachrichtenActive ? 'bg-sidebar-accent text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60',
          unreadNotifs > 0 && !nachrichtenActive && 'border border-destructive/40 bg-destructive/5'
        )}>
          <div className="relative shrink-0">
            <Bell className="h-4 w-4" aria-hidden="true" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-[16px] min-w-[16px] px-0.5 text-[9px] font-bold rounded-full bg-destructive text-destructive-foreground">
                {unreadNotifs > 99 ? '99+' : unreadNotifs}
              </span>
            )}
          </div>
          {!collapsed && <span>Nachrichten</span>}
        </NavLink>

        {/* Einstellungen */}
        <NavLink to="/einstellungen" className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[40px]',
          location.pathname === '/einstellungen' ? 'bg-sidebar-accent text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60'
        )}>
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Einstellungen</span>}
          {!collapsed && pendingCount > 0 && (
            <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5">{pendingCount}</span>
          )}
        </NavLink>
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground truncate px-3">{user.email}</p>
        )}
        <div className="flex items-center gap-2 px-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 transition-colors"
                aria-label={theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'}
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={signOut}
            className="flex-1 justify-start text-muted-foreground hover:text-destructive min-h-[40px] px-3"
            aria-label="Abmelden">
            <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
            {!collapsed && 'Abmelden'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
