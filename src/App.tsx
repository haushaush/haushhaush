import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ARIAProvider } from "@/contexts/ARIAContext";
import { PreferencesProvider } from "@/hooks/usePreferences";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { ErrorProvider } from "@/contexts/ErrorContext";
import { ErrorCardOverlay } from "@/components/ErrorCardOverlay";
import { ARIASystem } from "@/components/aria/ARIASystem";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";
import Auth from "./pages/Auth.tsx";
import LeadQualityAudit from "./pages/tools/LeadQualityAudit.tsx";
import Profil from "./pages/Profil.tsx";
import Registrierung from "./pages/Registrierung.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Kunden from "./pages/Kunden.tsx";
import KundenDetail from "./pages/KundenDetail.tsx";
import KundenAbschluesse from "./pages/KundenAbschluesse.tsx";
import KundenLaufzeiten from "./pages/KundenLaufzeiten.tsx";
import Projekte from "./pages/Projekte.tsx";
import ProjekteAufgaben from "./pages/ProjekteAufgaben.tsx";

import Sales from "./pages/Sales.tsx";
import SalesUebersicht from "./pages/sales/SalesUebersicht.tsx";
import CloseKpiTest from "./pages/sales/CloseKpiTest.tsx";

import Finanzen from "./pages/Finanzen.tsx";
import TeamPage from "./pages/Team.tsx";
import Einstellungen from "./pages/Einstellungen.tsx";
import Integrationen from "./pages/Integrationen.tsx";
import CloseVerknuepfungen from "./pages/CloseVerknuepfungen.tsx";
import MetaVerknuepfungen from "./pages/MetaVerknuepfungen.tsx";
import Creatives from "./pages/Creatives.tsx";
import CreativeDetail from "./pages/CreativeDetail.tsx";
import CreativeReview from "./pages/CreativeReview.tsx";
import Nachrichten from "./pages/Nachrichten.tsx";
import ApiDocs from "./pages/ApiDocs.tsx";
import ErrorPage from "./pages/ErrorPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import AriaPage from "./pages/Aria.tsx";
import MitarbeiterDetail from "./pages/MitarbeiterDetail.tsx";
import Register from "./pages/Register.tsx";
import AdCreativeStudio from "./pages/tools/AdCreativeStudio.tsx";
import CloseLeads from "./pages/CloseLeads.tsx";
import CloseDeals from "./pages/CloseDeals.tsx";
import MetaUebersicht from "./pages/meta/MetaUebersicht.tsx";
import MetaKampagnen from "./pages/meta/MetaKampagnen.tsx";
import MetaAnzeigengruppen from "./pages/meta/MetaAnzeigengruppen.tsx";
import MetaAnzeigen from "./pages/meta/MetaAnzeigen.tsx";
import MetaAbrechnungen from "./pages/meta/MetaAbrechnungen.tsx";
import { MetaAdsProvider } from "./contexts/MetaAdsContext";
import DriveUebersicht from "./pages/drive/DriveUebersicht.tsx";
import DriveMeineDateien from "./pages/drive/DriveMeineDateien.tsx";
import DriveGeteilt from "./pages/drive/DriveGeteilt.tsx";
import DrivePapierkorb from "./pages/drive/DrivePapierkorb.tsx";
import N8nWorkflowsPage from "./pages/automationen/N8nWorkflows.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import EmailPage from "./pages/Email.tsx";
import EmailAutomationRules from "./pages/EmailAutomationRules.tsx";

import Recovery from "./pages/Recovery.tsx";
import OnePageKunden from "./pages/OnePageKunden.tsx";
import OnePageKundeDetail from "./pages/OnePageKundeDetail.tsx";
import ReferenzShowcaseOverview from "./pages/sales/ReferenzShowcaseOverview.tsx";
import ReferenzWebsitesPage from "./pages/sales/ReferenzWebsites.tsx";
import ReferenzWebsiteDetail from "./pages/sales/ReferenzWebsiteDetail.tsx";
import ReferenzWerbeanzeigenPage from "./pages/sales/ReferenzWerbeanzeigen.tsx";
import ReferenzWerbeanzeigeDetail from "./pages/sales/ReferenzWerbeanzeigeDetail.tsx";
import AdPerformancePage from "./pages/sales/AdPerformance.tsx";
import AdPerformanceDetail from "./pages/sales/AdPerformanceDetail.tsx";
import ImportBlacklist from "./pages/ImportBlacklist.tsx";
import CloseSync from "./pages/admin/CloseSync.tsx";
import PublicShowcaseView from "./pages/PublicShowcaseView.tsx";
import PublicShowcaseLayout from "./pages/PublicShowcaseLayout.tsx";
import { ShowcaseAuthRedirect } from "./components/ShowcaseAuthRedirect";
import { AdminRoute } from "./components/AdminRoute";
import { PermissionRoute } from "./components/PermissionRoute";
import { useOnboardingGuard } from "./hooks/useOnboardingGuard";
import { useFunnelGuard } from "./hooks/useFunnelGuard";
import DailyFunnel from "./pages/DailyFunnel.tsx";
import CheckinOverview from "./pages/hr/CheckinOverview.tsx";
import TimeTracking from "./pages/hr/TimeTracking.tsx";
import SlackPage from "./pages/SlackPage.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
});

const DL = ({ children }: { children: React.ReactNode }) => <DashboardLayout>{children}</DashboardLayout>;

function OnboardingGuardRunner() {
  useOnboardingGuard();
  useFunnelGuard();
  return null;
}

function OfflineDetector() {
  useEffect(() => {
    const handleOffline = () => {
      toast.error('Keine Internetverbindung', { id: 'offline-toast', duration: Infinity });
    };
    const handleOnline = () => {
      toast.dismiss('offline-toast');
      toast.success('Verbindung wiederhergestellt ✓', { duration: 3000 });
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  return null;
}

const App = () => (
  <ErrorBoundary>
    <ErrorProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OfflineDetector />
        <BrowserRouter>
          <AuthProvider>
            <PreferencesProvider>
            <MusicPlayerProvider>
            <ARIAProvider>
              <MetaAdsProvider>
              <OnboardingGuardRunner />
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/registrierung" element={<Registrierung />} />
                <Route path="/register" element={<Register />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/recovery" element={<Recovery />} />
                <Route path="/" element={<PermissionRoute permissionKey="dashboard.view"><DL><Dashboard /></DL></PermissionRoute>} />
                <Route path="/kunden" element={<PermissionRoute permissionKey="clients.view"><DL><Kunden /></DL></PermissionRoute>} />
                <Route path="/kunden/abschluesse" element={<PermissionRoute permissionKey="clients.view"><DL><KundenAbschluesse /></DL></PermissionRoute>} />
                <Route path="/kunden/laufzeiten" element={<PermissionRoute permissionKey="clients.laufzeiten.view"><DL><KundenLaufzeiten /></DL></PermissionRoute>} />
                <Route path="/kunden/:id" element={<PermissionRoute permissionKey="clients.view"><DL><KundenDetail /></DL></PermissionRoute>} />
                <Route path="/close" element={<Navigate to="/close/leads" replace />} />
                <Route path="/close/leads" element={<DL><CloseLeads /></DL>} />
                <Route path="/close/deals" element={<DL><CloseDeals /></DL>} />
                <Route path="/meta" element={<Navigate to="/meta/uebersicht" replace />} />
                <Route path="/meta/uebersicht" element={<DL><MetaUebersicht /></DL>} />
                <Route path="/meta/kampagnen" element={<DL><MetaKampagnen /></DL>} />
                <Route path="/meta/anzeigengruppen" element={<DL><MetaAnzeigengruppen /></DL>} />
                <Route path="/meta/anzeigen" element={<DL><MetaAnzeigen /></DL>} />
                <Route path="/onepage-leads" element={<AdminRoute><Navigate to="/onepage-leads/kunden" replace /></AdminRoute>} />
                <Route path="/onepage-leads/kunden" element={<AdminRoute><DL><OnePageKunden /></DL></AdminRoute>} />
                <Route path="/onepage-leads/kunden/:id" element={<AdminRoute><DL><OnePageKundeDetail /></DL></AdminRoute>} />
                <Route path="/drive" element={<PermissionRoute permissionKey="drive.view"><DL><DriveUebersicht /></DL></PermissionRoute>} />
                <Route path="/drive/meine-dateien" element={<PermissionRoute permissionKey="drive.view"><DL><DriveMeineDateien /></DL></PermissionRoute>} />
                <Route path="/drive/geteilt" element={<PermissionRoute permissionKey="drive.view"><DL><DriveGeteilt /></DL></PermissionRoute>} />
                <Route path="/drive/papierkorb" element={<PermissionRoute permissionKey="drive.view"><DL><DrivePapierkorb /></DL></PermissionRoute>} />
                <Route path="/projekte" element={<PermissionRoute permissionKey="projects.view"><DL><Projekte /></DL></PermissionRoute>} />
                <Route path="/projekte/aufgaben" element={<PermissionRoute permissionKey="tasks.view"><DL><ProjekteAufgaben /></DL></PermissionRoute>} />
                
                <Route path="/sales" element={<Navigate to="/sales/uebersicht" replace />} />
                <Route path="/sales/uebersicht" element={<PermissionRoute permissionKey="sales.view"><DL><SalesUebersicht /></DL></PermissionRoute>} />
                <Route path="/sales/close-kpi-test" element={<AdminRoute><DL><CloseKpiTest /></DL></AdminRoute>} />
                <Route path="/sales/referenz-showcase" element={<ShowcaseAuthRedirect><DL><ReferenzShowcaseOverview /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/websites" element={<ShowcaseAuthRedirect><DL><ReferenzWebsitesPage /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/websites/:id" element={<ShowcaseAuthRedirect><DL><ReferenzWebsiteDetail /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/werbeanzeigen" element={<ShowcaseAuthRedirect><DL><ReferenzWerbeanzeigenPage /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/werbeanzeigen/:id" element={<ShowcaseAuthRedirect><DL><ReferenzWerbeanzeigeDetail /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/ad-creatives" element={<ShowcaseAuthRedirect><DL><ReferenzWerbeanzeigenPage /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/ad-creatives/:id" element={<ShowcaseAuthRedirect><DL><ReferenzWerbeanzeigeDetail /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/ad-performance" element={<ShowcaseAuthRedirect><DL><AdPerformancePage /></DL></ShowcaseAuthRedirect>} />
                <Route path="/sales/referenz-showcase/ad-performance/:id" element={<ShowcaseAuthRedirect><DL><AdPerformanceDetail /></DL></ShowcaseAuthRedirect>} />
                <Route path="/admin/import-blacklist" element={<AdminRoute><DL><ImportBlacklist /></DL></AdminRoute>} />
                <Route path="/admin/close-sync" element={<AdminRoute><DL><CloseSync /></DL></AdminRoute>} />

                {/* Public showcase (no auth required) */}
                <Route path="/showcase" element={<PublicShowcaseLayout />}>
                  <Route index element={<ReferenzShowcaseOverview />} />
                  <Route path="websites" element={<ReferenzWebsitesPage />} />
                  <Route path="websites/:id" element={<ReferenzWebsiteDetail />} />
                  <Route path="werbeanzeigen" element={<ReferenzWerbeanzeigenPage />} />
                  <Route path="werbeanzeigen/:id" element={<ReferenzWerbeanzeigeDetail />} />
                  <Route path="ad-creatives" element={<ReferenzWerbeanzeigenPage />} />
                  <Route path="ad-creatives/:id" element={<ReferenzWerbeanzeigeDetail />} />
                  <Route path="ad-performance" element={<AdPerformancePage />} />
                  <Route path="ad-performance/:id" element={<AdPerformanceDetail />} />
                </Route>
                <Route path="/sales/:tab" element={<PermissionRoute permissionKey="sales.view"><DL><Sales /></DL></PermissionRoute>} />
                <Route path="/finanzen" element={<PermissionRoute permissionKey="finanzen.view"><DL><Finanzen /></DL></PermissionRoute>} />
                <Route path="/finanzen/:tab" element={<PermissionRoute permissionKey="finanzen.view"><DL><Finanzen /></DL></PermissionRoute>} />
                <Route path="/funnel" element={<DailyFunnel />} />
                <Route path="/hr" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/hr/checkins" element={<AdminRoute><DL><CheckinOverview /></DL></AdminRoute>} />
                <Route path="/hr/time-tracking" element={<AdminRoute><DL><TimeTracking /></DL></AdminRoute>} />
                <Route path="/hr/mitarbeiter/:id" element={<PermissionRoute permissionKey="team.view"><DL><MitarbeiterDetail /></DL></PermissionRoute>} />
                <Route path="/hr/:tab" element={<PermissionRoute permissionKey="team.view"><DL><TeamPage /></DL></PermissionRoute>} />
                <Route path="/nachrichten" element={<DL><Nachrichten /></DL>} />
                <Route path="/email" element={<Navigate to="/nachrichten?tab=email" replace />} />
                <Route path="/email/:slug" element={<Navigate to="/nachrichten?tab=email" replace />} />
                <Route path="/email-automatisierung" element={<AdminRoute><DL><EmailPage mode="shared" /></DL></AdminRoute>} />
                <Route path="/email-automatisierung/regeln" element={<AdminRoute><DL><EmailAutomationRules /></DL></AdminRoute>} />
                <Route path="/email-automatisierung/:slug" element={<AdminRoute><DL><EmailPage mode="shared" /></DL></AdminRoute>} />
                <Route path="/einstellungen" element={<DL><Einstellungen /></DL>} />
                <Route path="/integrationen" element={<AdminRoute><DL><Integrationen /></DL></AdminRoute>} />
                <Route path="/slack" element={<AdminRoute><DL><SlackPage /></DL></AdminRoute>} />
                <Route path="/close/verknuepfungen" element={<AdminRoute><DL><CloseVerknuepfungen /></DL></AdminRoute>} />
                <Route path="/meta/verknuepfungen" element={<AdminRoute><DL><MetaVerknuepfungen /></DL></AdminRoute>} />
                <Route path="/aria" element={<DL><AriaPage /></DL>} />
                <Route path="/automationen" element={<Navigate to="/automationen/aria" replace />} />
                <Route path="/automationen/aria" element={<DL><AriaPage /></DL>} />
                <Route path="/automationen/n8n" element={<DL><N8nWorkflowsPage /></DL>} />
                <Route path="/api-docs" element={<ApiDocs />} />
                <Route path="/profil" element={<DL><Profil /></DL>} />
                <Route path="/creatives" element={<DL><Creatives /></DL>} />
                <Route path="/creatives/:id" element={<DL><CreativeDetail /></DL>} />
                <Route path="/review/:token" element={<CreativeReview />} />
                <Route path="/tools/ad-creative-studio" element={<DL><AdCreativeStudio /></DL>} />
                <Route path="/tools/lead-quality-audit" element={<DL><LeadQualityAudit /></DL>} />
                <Route path="/showcase/:id" element={<PublicShowcaseView />} />

                {/* Redirects */}
                <Route path="/performance" element={<Navigate to="/sales/kpis" replace />} />
                <Route path="/team" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/kpi" element={<Navigate to="/sales/kpis" replace />} />
                <Route path="/faktura" element={<Navigate to="/finanzen/rechnungen" replace />} />
                <Route path="/mitarbeiter" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/dateien" element={<Navigate to="/kunden" replace />} />
                <Route path="/learning" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/aufgaben" element={<Navigate to="/projekte/aufgaben" replace />} />

                <Route path="*" element={<ErrorPage type="404" />} />
              </Routes>
              <ARIASystem />
              </MetaAdsProvider>
            </ARIAProvider>
            </MusicPlayerProvider>
            </PreferencesProvider>
          </AuthProvider>
        </BrowserRouter>
        <ErrorCardOverlay />
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorProvider>
  </ErrorBoundary>
);

export default App;
