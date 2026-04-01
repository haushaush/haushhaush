import { Home, Users, FolderOpen, BarChart3, Euro, UserCircle, ClipboardList, LogOut } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const navItems = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'Kunden', url: '/kunden', icon: Users },
  { title: 'Projekte', url: '/projekte', icon: FolderOpen },
  { title: 'KPI', url: '/kpi', icon: BarChart3 },
  { title: 'Finanzen', url: '/finanzen', icon: Euro },
  { title: 'Mitarbeiter', url: '/mitarbeiter', icon: UserCircle },
  { title: 'Aufgaben', url: '/aufgaben', icon: ClipboardList },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed && (
            <div>
              <h2 className="font-heading text-lg font-bold text-primary">Agency</h2>
              <p className="text-xs text-sidebar-foreground/60">Haush Haush · Viral Connect</p>
            </div>
          )}
          {collapsed && <span className="text-primary font-heading font-bold text-lg">A</span>}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <p className="text-xs text-sidebar-foreground/60 mb-2 truncate">{user.email}</p>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/60 hover:text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && 'Abmelden'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
