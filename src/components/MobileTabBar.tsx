import { Home, Users, BarChart3, HardDrive, ClipboardList } from 'lucide-react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';

const tabs = [
  { title: 'Home', url: '/', icon: Home },
  { title: 'Kunden', url: '/kunden', icon: Users },
  { title: 'Dateien', url: '/dateien', icon: HardDrive },
  { title: 'KPI', url: '/kpi', icon: BarChart3 },
  { title: 'Aufgaben', url: '/aufgaben', icon: ClipboardList },
];

export function MobileTabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around h-16 md:hidden"
      role="navigation"
      aria-label="Hauptnavigation"
    >
      {tabs.map(tab => {
        const active = tab.url === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.url);
        return (
          <RouterNavLink
            key={tab.url}
            to={tab.url}
            className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded-md transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}
            aria-label={tab.title}
            aria-current={active ? 'page' : undefined}
          >
            <tab.icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] mt-0.5 font-medium">{tab.title}</span>
          </RouterNavLink>
        );
      })}
    </nav>
  );
}
