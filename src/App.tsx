import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Kunden from "./pages/Kunden.tsx";
import KundenDetail from "./pages/KundenDetail.tsx";
import Performance from "./pages/Performance.tsx";
import Finanzen from "./pages/Finanzen.tsx";
import TeamPage from "./pages/Team.tsx";
import Einstellungen from "./pages/Einstellungen.tsx";
import Creatives from "./pages/Creatives.tsx";
import CreativeDetail from "./pages/CreativeDetail.tsx";
import CreativeReview from "./pages/CreativeReview.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
            <Route path="/kunden" element={<DashboardLayout><Kunden /></DashboardLayout>} />
            <Route path="/kunden/:id" element={<DashboardLayout><KundenDetail /></DashboardLayout>} />
            <Route path="/performance" element={<DashboardLayout><Performance /></DashboardLayout>} />
            <Route path="/finanzen" element={<DashboardLayout><Finanzen /></DashboardLayout>} />
            <Route path="/team" element={<DashboardLayout><TeamPage /></DashboardLayout>} />
            <Route path="/einstellungen" element={<DashboardLayout><Einstellungen /></DashboardLayout>} />
            <Route path="/creatives" element={<DashboardLayout><Creatives /></DashboardLayout>} />
            <Route path="/creatives/:id" element={<DashboardLayout><CreativeDetail /></DashboardLayout>} />
            <Route path="/review/:token" element={<CreativeReview />} />

            {/* Redirects for old routes */}
            <Route path="/projekte" element={<Navigate to="/kunden?tab=projekte" replace />} />
            <Route path="/kpi" element={<Navigate to="/performance" replace />} />
            <Route path="/faktura" element={<Navigate to="/finanzen?tab=rechnungen" replace />} />
            <Route path="/mitarbeiter" element={<Navigate to="/team" replace />} />
            <Route path="/dateien" element={<Navigate to="/kunden" replace />} />
            <Route path="/learning" element={<Navigate to="/team?tab=akademie" replace />} />
            <Route path="/aufgaben" element={<Navigate to="/kunden" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
