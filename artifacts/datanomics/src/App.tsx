import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "react-hot-toast";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

import AppLayout from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CandidatesPage = lazy(() => import("@/pages/CandidatesPage"));
const CandidateDetailPage = lazy(() => import("@/pages/CandidateDetailPage"));
const ApplicationsPage = lazy(() => import("@/pages/ApplicationsPage"));
const ResumesPage = lazy(() => import("@/pages/ResumesPage"));
const MessagesPage = lazy(() => import("@/pages/MessagesPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage"));
const TeamPage = lazy(() => import("@/pages/TeamPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ClientPortalPage = lazy(() => import("@/pages/ClientPortalPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function PageShell() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function Router() {
  const { user, loading } = useAuthStore();

  if (loading) {
    return <PageShell />;
  }

  if (!user) {
    return (
      <Suspense fallback={<PageShell />}>
        <LoginPage />
      </Suspense>
    );
  }

  if (user.role === "client") {
    return (
      <Suspense fallback={<PageShell />}>
        <Switch>
          <Route path="/" component={ClientPortalPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }>
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
            {() => (
              <ProtectedRoute roles={["admin", "manager"]}>
                <TeamPage />
              </ProtectedRoute>
            )}
          </Route>
          <Route path="/settings">
            {() => (
              <ProtectedRoute roles={["admin"]}>
                <SettingsPage />
              </ProtectedRoute>
            )}
          </Route>
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
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
            background: "#1B2D4F",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
            fontFamily: "'DM Sans', sans-serif",
          },
          success: {
            iconTheme: { primary: "#00C896", secondary: "#0F1C33" },
          },
          error: {
            iconTheme: { primary: "#EF4444", secondary: "#fff" },
          },
        }}
      />
    </WouterRouter>
  );
}

export default App;
