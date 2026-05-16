import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Subjects from "@/pages/subjects";
import SubjectDetail from "@/pages/subject-detail";
import ChapterDetail from "@/pages/chapter-detail";
import TopicDetail from "@/pages/topic-detail";
import ExamInterface from "@/pages/exam-interface";
import ExamResults from "@/pages/exam-results";
import Profile from "@/pages/profile";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminUsers from "@/pages/admin-users";
import AdminSubjects from "@/pages/admin-subjects";
import AdminQuestions from "@/pages/admin-questions";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient();

// A wrapper to enforce authentication and layout
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

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  if (isLoading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background text-primary">Loading...</div>;
  }

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
