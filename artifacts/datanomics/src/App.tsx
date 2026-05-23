import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "react-hot-toast";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

// Pages - lazy loaded for performance
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CandidatesPage from "@/pages/CandidatesPage";
import CandidateDetailPage from "@/pages/CandidateDetailPage";
import ApplicationsPage from "@/pages/ApplicationsPage";
import ResumesPage from "@/pages/ResumesPage";
import MessagesPage from "@/pages/MessagesPage";
import ReportsPage from "@/pages/ReportsPage";
import TemplatesPage from "@/pages/TemplatesPage";
import TeamPage from "@/pages/TeamPage";
import SettingsPage from "@/pages/SettingsPage";
import ClientPortalPage from "@/pages/ClientPortalPage";
import NotFoundPage from "@/pages/NotFoundPage";

import AppLayout from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";

function Router() {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm font-body">Loading Datanomics...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Client portal — separate layout
  if (user.role === 'client') {
    return (
      <Switch>
        <Route path="/" component={ClientPortalPage} />
        <Route component={NotFoundPage} />
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/candidates" component={CandidatesPage} />
        <Route path="/candidates/:id" component={CandidateDetailPage} />
        <Route path="/applications" component={ApplicationsPage} />
        <Route path="/resumes" component={ResumesPage} />
        <Route path="/messages" component={MessagesPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/team">
          {() => <ProtectedRoute roles={['admin', 'manager']}><TeamPage /></ProtectedRoute>}
        </Route>
        <Route path="/settings">
          {() => <ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>}
        </Route>
        <Route component={NotFoundPage} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1B2D4F',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'DM Sans', sans-serif",
          },
          success: {
            iconTheme: { primary: '#00C896', secondary: '#0F1C33' },
          },
          error: {
            iconTheme: { primary: '#EF4444', secondary: '#fff' },
          },
        }}
      />
    </WouterRouter>
  );
}

export default App;
