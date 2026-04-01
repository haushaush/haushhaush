import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Kunden from "./pages/Kunden.tsx";
import KundenDetail from "./pages/KundenDetail.tsx";
import Projekte from "./pages/Projekte.tsx";
import KPI from "./pages/KPI.tsx";
import Finanzen from "./pages/Finanzen.tsx";
import Mitarbeiter from "./pages/Mitarbeiter.tsx";
import Aufgaben from "./pages/Aufgaben.tsx";
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
            <Route path="/projekte" element={<DashboardLayout><Projekte /></DashboardLayout>} />
            <Route path="/kpi" element={<DashboardLayout><KPI /></DashboardLayout>} />
            <Route path="/finanzen" element={<DashboardLayout><Finanzen /></DashboardLayout>} />
            <Route path="/mitarbeiter" element={<DashboardLayout><Mitarbeiter /></DashboardLayout>} />
            <Route path="/aufgaben" element={<DashboardLayout><Aufgaben /></DashboardLayout>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
