import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileTabBar } from '@/components/MobileTabBar';
import { useIsMobile } from '@/hooks/use-mobile';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-busy="true">
        <div className="text-primary animate-pulse text-2xl font-semibold">Laden...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
          Zum Inhalt springen
        </a>
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-10 overflow-auto pb-20 md:pb-6 min-w-0" role="main" aria-label="Hauptinhalt">
            {children}
          </main>
        </div>
        {isMobile && <MobileTabBar />}
      </div>
    </SidebarProvider>
  );
}
