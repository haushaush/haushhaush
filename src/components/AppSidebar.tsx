import { useState, useEffect } from 'react';
import { Home, Users, ClipboardList, TrendingUp, Euro, UserCircle, Settings, LogOut, ChevronRight, ChevronLeft, Sun, Moon, Bell, Bug, Sparkles, Briefcase, Facebook, FolderOpen, Workflow, Mail, Globe, Wrench, Plug, Hash, Megaphone, Code2 } from 'lucide-react';

import { BugReportModal } from '@/components/BugReportWidget';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { usePermissions } from '@/hooks/usePermissions';
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
  children?: { title: string; url: string; adminOnly?: boolean; permissionKey?: string }[];
  adminOnly?: boolean;
  permissionKey?: string;
}

const navItems: NavItem[] = [
  { title: 'Übersicht', url: '/', icon: Home, permissionKey: 'dashboard.view' },
  {
    title: 'Kunden', url: '/kunden', icon: Users, permissionKey: 'clients.view',
    children: [
      { title: 'Übersicht', url: '/kunden', permissionKey: 'clients.view' },
      { title: 'Kunden', url: '/kunden/liste', permissionKey: 'clients.view' },
      { title: 'Abschlüsse', url: '/kunden/abschluesse', permissionKey: 'clients.view' },
      { title: 'Laufzeiten', url: '/kunden/laufzeiten', permissionKey: 'clients.laufzeiten.view' },
    ],
  },
  {
    title: 'Sales', url: '/sales', icon: TrendingUp, permissionKey: 'sales.view',
    children: [
      { title: 'Übersicht', url: '/sales/uebersicht', permissionKey: 'sales.view' },
      { title: 'KPI', url: '/sales/kpi', permissionKey: 'sales.view' },
      { title: 'Referenzen', url: '/sales/referenz-showcase', permissionKey: 'sales.referenzen.view' },
      { title: 'Lead Quality Audit', url: '/tools/lead-quality-audit' },
    ],
  },
  {
    title: 'Paid Ads', url: '/paid-ads', icon: Megaphone,
    children: [
      { title: 'Übersicht', url: '/paid-ads' },
      { title: 'Kunden', url: '/paid-ads/kunden' },
      { title: 'Untermarken', url: '/paid-ads/untermarken' },
      { title: 'Leadsharks', url: '/paid-ads/leadsharks' },
      { title: 'AttentionX', url: '/paid-ads/attentionx' },
    ],
  },
  {
    title: 'Development', url: '/sales/close-kpi-test', icon: Code2, adminOnly: true,
    children: [
      { title: 'Close KPI Test', url: '/sales/close-kpi-test', adminOnly: true },
    ],
  },
  {
    title: 'Fulfillment', url: '/projekte', icon: ClipboardList, permissionKey: 'projects.view',
    children: [
      { title: 'Projekte', url: '/projekte', permissionKey: 'projects.view' },
      { title: 'Aufgaben', url: '/projekte/aufgaben', permissionKey: 'tasks.view' },
    ],
  },
  {
    title: 'Finanzen', url: '/finanzen', icon: Euro, permissionKey: 'finanzen.view',
    children: [
      { title: 'Übersicht', url: '/finanzen', permissionKey: 'finanzen.view' },
      { title: 'KPI', url: '/finanzen/kpi', permissionKey: 'finanzen.view' },
      { title: 'Rechnungen', url: '/finanzen/rechnungen', permissionKey: 'finanzen.view' },
      { title: 'Werbebudgets', url: '/finanzen/werbebudgets', permissionKey: 'finanzen.view' },
      { title: 'Meta Belege', url: '/finanzen/abrechnungen', permissionKey: 'meta.billing.view' },
    ],
  },
  {
    title: 'Dokumente', url: '/drive/meine-dateien', icon: FolderOpen, permissionKey: 'drive.view',
    children: [
      { title: 'Meine Dateien', url: '/drive/meine-dateien', permissionKey: 'drive.view' },
      { title: 'Geteilt mit mir', url: '/drive/geteilt', permissionKey: 'drive.view' },
      { title: 'Papierkorb', url: '/drive/papierkorb', permissionKey: 'drive.view' },
    ],
  },
  {
    title: 'Team & HR', url: '/hr', icon: UserCircle, permissionKey: 'team.view',
    children: [
      { title: 'Mitarbeiter', url: '/hr/mitarbeiter', permissionKey: 'team.view' },
      { title: 'Check-in & Check-out', url: '/hr/checkins' },
      { title: 'Time Tracking', url: '/hr/time-tracking', adminOnly: true, permissionKey: 'time_tracking.admin.view' },
    ],
  },
];

// Items that go under the "Integrationen" expandable category
const toolsNavItems: NavItem[] = [
  { title: 'Übersicht', url: '/integrationen', icon: Plug, adminOnly: true, permissionKey: 'integrationen.view' },
  { title: 'Slack', url: '/slack', icon: Hash, adminOnly: true, permissionKey: 'slack.view' },
  {
    title: 'Close', url: '/close/verknuepfungen', icon: Briefcase, permissionKey: 'sales.close.view',
    children: [
      { title: 'Verknüpfungen', url: '/close/verknuepfungen', permissionKey: 'sales.close.view' },
      { title: 'Leads', url: '/close/leads', permissionKey: 'sales.close.view' },
      { title: 'Deals', url: '/close/deals', permissionKey: 'sales.close.view' },
    ],
  },
  {
    title: 'Meta Ads', url: '/meta/verknuepfungen', icon: Facebook, permissionKey: 'sales.meta.view',
    children: [
      { title: 'Verknüpfungen', url: '/meta/verknuepfungen', permissionKey: 'sales.meta.view' },
      { title: 'Übersicht', url: '/meta/uebersicht', permissionKey: 'sales.meta.view' },
      { title: 'Kampagnen', url: '/meta/kampagnen', permissionKey: 'sales.meta.view' },
      { title: 'Anzeigengruppen', url: '/meta/anzeigengruppen', permissionKey: 'sales.meta.view' },
      { title: 'Anzeigen', url: '/meta/anzeigen', permissionKey: 'sales.meta.view' },
    ],
  },
  {
    title: 'Onepage', url: '/onepage-leads/kunden', icon: Globe, adminOnly: true,
    children: [
      { title: 'Kunden', url: '/onepage-leads/kunden', adminOnly: true },
    ],
  },
  {
    title: 'Google Drive', url: '/drive', icon: FolderOpen, permissionKey: 'drive.view',
    children: [
      { title: 'Übersicht', url: '/drive', permissionKey: 'drive.view' },
      { title: 'Meine Dateien', url: '/drive/meine-dateien', permissionKey: 'drive.view' },
      { title: 'Geteilt mit mir', url: '/drive/geteilt', permissionKey: 'drive.view' },
      { title: 'Papierkorb', url: '/drive/papierkorb', permissionKey: 'drive.view' },
    ],
  },
  {
    title: 'E-Mail Automatisierung', url: '/email-automatisierung', icon: Mail, adminOnly: true,
    children: [
      { title: 'Posteingang', url: '/email-automatisierung', adminOnly: true },
      { title: 'Regeln', url: '/email-automatisierung/regeln', adminOnly: true },
    ],
  },
  { title: 'n8n', url: '/automationen/n8n', icon: Workflow },
  { title: 'FulfillmentOS KI', url: '/automationen/aria', icon: Sparkles },
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
  const { hasPermission } = usePermissions();
  const isAdmin = hasRole('admin');
  const filterByPermission = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.url.startsWith('/onepage-leads') && !isAdmin) return false;
    if (item.permissionKey && !hasPermission(item.permissionKey)) return false;
    if (item.children && item.children.length > 0) {
      const anyChildVisible = item.children.some(c => {
        if (c.adminOnly && !isAdmin) return false;
        if (c.permissionKey && !hasPermission(c.permissionKey)) return false;
        return true;
      });
      if (!anyChildVisible) return false;
    }
    return true;
  };
  const childVisible = (c: { adminOnly?: boolean; permissionKey?: string }) => {
    if (c.adminOnly && !isAdmin) return false;
    if (c.permissionKey && !hasPermission(c.permissionKey)) return false;
    return true;
  };
  const visibleNavItems = navItems.filter(filterByPermission);
  const visibleToolsItems = toolsNavItems.filter(filterByPermission);
  const { displayName, initials, avatarUrl } = useProfile();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [bugModalOpen, setBugModalOpen] = useState(false);
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

  // Split navItems: items before Finanzen = top group, Finanzen onwards = bottom group
  const toolsInsertIndex = visibleNavItems.findIndex(i => i.title === 'Finanzen');
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
            {item.children!.filter(childVisible).map(child => {
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
                <TooltipContent side="right" className="text-xs">Integrationen</TooltipContent>
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
                  <span className="flex-1 truncate">Integrationen</span>
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
                              {toolItem.children!.map(child => {
                                const childActive = isActive(child.url);
                                return (
                                  <NavLink key={child.url} to={child.url} end={child.url === toolItem.url} className={cn(
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
