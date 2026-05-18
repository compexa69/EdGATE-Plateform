import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { createContext, useContext, useEffect, useState } from "react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import VerifyEmail from "@/pages/verify-email";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Subjects from "@/pages/subjects";
import SubjectDetail from "@/pages/subject-detail";
import ChapterDetail from "@/pages/chapter-detail";
import TopicDetail from "@/pages/topic-detail";
import ExamInterface from "@/pages/exam-interface";
import ExamResults from "@/pages/exam-results";
import Profile from "@/pages/profile";
import Notes from "@/pages/notes";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminUsers from "@/pages/admin-users";
import AdminSubjects from "@/pages/admin-subjects";
import AdminQuestions from "@/pages/admin-questions";
import AdminExams from "@/pages/admin-exams";
import AdminSettings from "@/pages/admin-settings";
import Leaderboard from "@/pages/leaderboard";
import Planner from "@/pages/planner";
import TestTracker from "@/pages/test-tracker";
import QrHistory from "@/pages/qr-history";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient();

// ─── Theme Context ────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
interface ThemeContextValue { theme: Theme; toggleTheme: () => void; }
export const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggleTheme: () => {} });
export function useThemeMode() { return useContext(ThemeContext); }

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("edtech_theme") as Theme) || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") { root.classList.add("dark"); } else { root.classList.remove("dark"); }
    try { localStorage.setItem("edtech_theme", theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
// ─────────────────────────────────────────────────────────────────────────────

function ProtectedRoute({ component: Component, adminOnly = false }: { component: any, adminOnly?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        setLocation("/login");
      } else if (adminOnly && user?.role !== "admin" && user?.role !== "super_admin") {
        setLocation("/dashboard");
      }
    }
  }, [isLoading, isAuthenticated, user, setLocation, adminOnly]);

  if (isLoading || !isAuthenticated || (adminOnly && user?.role !== "admin" && user?.role !== "super_admin")) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function AppRouter() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background text-primary">Loading...</div>;
  }

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/subjects">
        {() => <ProtectedRoute component={Subjects} />}
      </Route>
      <Route path="/subjects/:subjectId">
        {() => <ProtectedRoute component={SubjectDetail} />}
      </Route>
      <Route path="/chapters/:chapterId">
        {() => <ProtectedRoute component={ChapterDetail} />}
      </Route>
      <Route path="/topics/:topicId">
        {() => <ProtectedRoute component={TopicDetail} />}
      </Route>
      <Route path="/exam/:examId">
        {() => <ExamInterface />}
      </Route>
      <Route path="/results/:resultId">
        {() => <ProtectedRoute component={ExamResults} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/notes">
        {() => <ProtectedRoute component={Notes} />}
      </Route>
      <Route path="/leaderboard">
        {() => <ProtectedRoute component={Leaderboard} />}
      </Route>
      <Route path="/planner">
        {() => <ProtectedRoute component={Planner} />}
      </Route>

      <Route path="/admin">
        {() => <ProtectedRoute component={AdminDashboard} adminOnly={true} />}
      </Route>
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsers} adminOnly={true} />}
      </Route>
      <Route path="/admin/subjects">
        {() => <ProtectedRoute component={AdminSubjects} adminOnly={true} />}
      </Route>
      <Route path="/admin/questions">
        {() => <ProtectedRoute component={AdminQuestions} adminOnly={true} />}
      </Route>
      <Route path="/admin/exams">
        {() => <ProtectedRoute component={AdminExams} adminOnly={true} />}
      </Route>
      <Route path="/admin/settings">
        {() => <ProtectedRoute component={AdminSettings} adminOnly={true} />}
      </Route>
      <Route path="/test-tracker">
        {() => <ProtectedRoute component={TestTracker} />}
      </Route>
      <Route path="/qr-history">
        {() => <ProtectedRoute component={QrHistory} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRouter />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
