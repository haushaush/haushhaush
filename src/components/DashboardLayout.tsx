import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileTabBar } from '@/components/MobileTabBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { TimerBar } from '@/components/dashboard/TimerBar';
import { BugReportWidget } from '@/components/BugReportWidget';
import { MiniPlayerBar } from '@/components/layout/MiniPlayerBar';
import { ARIASearchBar } from '@/components/aria/ARIASearchBar';
import { ARIAPanel } from '@/components/aria/ARIAPanel';
import { useARIA } from '@/contexts/ARIAContext';
import { usePreferences } from '@/hooks/usePreferences';
import { MfaGate } from '@/components/mfa/MfaGate';

function SidebarWidthSync() {
  const { state, isMobile } = useSidebar();
  useEffect(() => {
    const width = isMobile ? '0px' : state === 'expanded' ? '240px' : '48px';
    document.documentElement.style.setProperty('--sidebar-width', width);
    return () => { document.documentElement.style.removeProperty('--sidebar-width'); };
  }, [state, isMobile]);
  return null;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const { isOpen, modalOpen } = useARIA();
  const { showAria } = usePreferences();
  const location = useLocation();
  const isOnHome = location.pathname === '/';
  const [ariaInput, setAriaInput] = useState('');

  const handleAriaSend = (text: string) => {
    window.dispatchEvent(new CustomEvent('aria-send', { detail: text }));
    setAriaInput('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-busy="true">
        <div className="text-primary animate-pulse text-2xl font-semibold">Laden...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <MfaGate>
    <SidebarProvider>
      <SidebarWidthSync />
      <div className="min-h-screen flex w-full">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
          Zum Inhalt springen
        </a>
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <TimerBar />
          <MiniPlayerBar />
          <main
            id="main-content"
            className="flex-1 p-4 sm:p-6 lg:p-10 overflow-auto min-w-0 pb-24 md:pb-24"
            role="main"
            aria-label="Hauptinhalt"
          >
            {children}
          </main>
        </div>
        {isMobile && <MobileTabBar />}
        <BugReportWidget />

        {/* Unified ARIA wrapper: panel + pill — hidden on home page */}
        {!isOnHome && (
          <div
            className={`aria-bottom-bar ${isOpen ? 'aria-bottom-bar--open' : ''}`}
            tabIndex={-1}
            style={{
              opacity: modalOpen ? 0.4 : 1,
              pointerEvents: modalOpen ? 'none' : 'all',
              transition: 'opacity 200ms ease',
            }}
            onFocus={(e) => {
              e.stopPropagation();
              window.scrollTo(window.scrollX, window.scrollY);
            }}
          >
            <ARIAPanel />
            <ARIASearchBar
              onSend={handleAriaSend}
              input={ariaInput}
              setInput={setAriaInput}
            />
          </div>
        )}
      </div>
    </SidebarProvider>
    </MfaGate>
  );
}
