import { Home, Users, TrendingUp, Euro, UserCircle } from 'lucide-react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';

const tabs = [
  { title: 'Übersicht', url: '/', icon: Home },
  { title: 'Kunden', url: '/kunden', icon: Users },
  { title: 'Sales', url: '/sales', icon: TrendingUp },
  { title: 'Finanzen', url: '/finanzen', icon: Euro },
  { title: 'Team', url: '/hr', icon: UserCircle },
];

export function MobileTabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around md:hidden"
      style={{ height: 'calc(56px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="navigation"
      aria-label="Hauptnavigation"
    >
      {tabs.map(tab => {
        const active = tab.url === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.url);
        return (
          <RouterNavLink key={tab.url} to={tab.url}
            className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded-md transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}
            aria-label={tab.title} aria-current={active ? 'page' : undefined}>
            <tab.icon className="h-[22px] w-[22px]" aria-hidden="true" />
            <span className="text-[10px] mt-0.5 font-medium">{tab.title}</span>
          </RouterNavLink>
        );
      })}
    </nav>
  );
}
