import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ARIAProvider } from "@/contexts/ARIAContext";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import { ErrorProvider } from "@/contexts/ErrorContext";
import { ErrorCardOverlay } from "@/components/ErrorCardOverlay";
import { ARIASystem } from "@/components/aria/ARIASystem";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";
import Auth from "./pages/Auth.tsx";
import Profil from "./pages/Profil.tsx";
import Registrierung from "./pages/Registrierung.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Kunden from "./pages/Kunden.tsx";
import KundenDetail from "./pages/KundenDetail.tsx";
import KundenPipeline from "./pages/KundenPipeline.tsx";
import KundenAbschluesse from "./pages/KundenAbschluesse.tsx";
import KundenLaufzeiten from "./pages/KundenLaufzeiten.tsx";
import Projekte from "./pages/Projekte.tsx";
import ProjekteAufgaben from "./pages/ProjekteAufgaben.tsx";
import Sales from "./pages/Sales.tsx";
import Fulfillment from "./pages/Fulfillment.tsx";
import Finanzen from "./pages/Finanzen.tsx";
import TeamPage from "./pages/Team.tsx";
import Einstellungen from "./pages/Einstellungen.tsx";
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

const queryClient = new QueryClient();

const DL = ({ children }: { children: React.ReactNode }) => <DashboardLayout>{children}</DashboardLayout>;

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
            <MusicPlayerProvider>
            <ARIAProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/registrierung" element={<Registrierung />} />
                <Route path="/register" element={<Register />} />
                <Route path="/" element={<DL><Dashboard /></DL>} />
                <Route path="/kunden" element={<DL><Kunden /></DL>} />
                <Route path="/kunden/pipeline" element={<DL><KundenPipeline /></DL>} />
                <Route path="/kunden/abschluesse" element={<DL><KundenAbschluesse /></DL>} />
                <Route path="/kunden/laufzeiten" element={<DL><KundenLaufzeiten /></DL>} />
                <Route path="/kunden/:id" element={<DL><KundenDetail /></DL>} />
                <Route path="/projekte" element={<DL><Projekte /></DL>} />
                <Route path="/projekte/aufgaben" element={<DL><ProjekteAufgaben /></DL>} />
                <Route path="/sales" element={<Navigate to="/sales/kpis" replace />} />
                <Route path="/sales/:tab" element={<DL><Sales /></DL>} />
                <Route path="/fulfillment" element={<Navigate to="/fulfillment/ads" replace />} />
                <Route path="/fulfillment/:tab" element={<DL><Fulfillment /></DL>} />
                <Route path="/finanzen" element={<DL><Finanzen /></DL>} />
                <Route path="/finanzen/:tab" element={<DL><Finanzen /></DL>} />
                <Route path="/hr" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/hr/mitarbeiter/:id" element={<DL><MitarbeiterDetail /></DL>} />
                <Route path="/hr/:tab" element={<DL><TeamPage /></DL>} />
                <Route path="/nachrichten" element={<DL><Nachrichten /></DL>} />
                <Route path="/einstellungen" element={<DL><Einstellungen /></DL>} />
                <Route path="/aria" element={<DL><AriaPage /></DL>} />
                <Route path="/api-docs" element={<ApiDocs />} />
                <Route path="/profil" element={<DL><Profil /></DL>} />
                <Route path="/creatives" element={<DL><Creatives /></DL>} />
                <Route path="/creatives/:id" element={<DL><CreativeDetail /></DL>} />
                <Route path="/review/:token" element={<CreativeReview />} />

                {/* Redirects */}
                <Route path="/performance" element={<Navigate to="/sales/kpis" replace />} />
                <Route path="/team" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/kpi" element={<Navigate to="/sales/kpis" replace />} />
                <Route path="/faktura" element={<Navigate to="/finanzen/rechnungen" replace />} />
                <Route path="/mitarbeiter" element={<Navigate to="/hr/mitarbeiter" replace />} />
                <Route path="/dateien" element={<Navigate to="/kunden" replace />} />
                <Route path="/learning" element={<Navigate to="/hr/akademie" replace />} />
                <Route path="/aufgaben" element={<Navigate to="/projekte/aufgaben" replace />} />

                <Route path="*" element={<ErrorPage type="404" />} />
              </Routes>
              <ARIASystem />
            </ARIAProvider>
            </MusicPlayerProvider>
          </AuthProvider>
        </BrowserRouter>
        <ErrorCardOverlay />
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorProvider>
  </ErrorBoundary>
);

export default App;
