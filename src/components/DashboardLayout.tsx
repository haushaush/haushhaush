import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileTabBar } from '@/components/MobileTabBar';
import { useIsMobile } from '@/hooks/use-mobile';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-busy="true" aria-label="Dashboard wird geladen">
        <div className="text-primary animate-pulse font-heading text-2xl">Laden...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Skip to content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
        >
          Zum Inhalt springen
        </a>

        {/* Desktop sidebar */}
        {!isMobile && <AppSidebar />}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card/50 backdrop-blur" role="banner">
            {!isMobile && (
              <SidebarTrigger className="mr-4 min-h-[44px] min-w-[44px]" aria-label="Seitenleiste umschalten" />
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-medium">HHD UG</span>
              <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-medium">VC GmbH</span>
            </div>
          </header>
          <main
            id="main-content"
            className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6"
            role="main"
            aria-label="Hauptinhalt"
          >
            {children}
          </main>
        </div>

        {/* Mobile bottom tab bar */}
        {isMobile && <MobileTabBar />}
      </div>
    </SidebarProvider>
  );
}
