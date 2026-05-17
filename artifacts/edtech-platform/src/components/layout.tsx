import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Home, BookOpen, User, LogOut, Settings, Trophy, CalendarDays, FolderOpen, ClipboardList } from "lucide-react";
import { PomodoroWidget } from "@/components/pomodoro";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    logout();
  };

  const navItems = [
    { label: "Dashboard",    href: "/dashboard",     icon: <Home          className="w-5 h-5" /> },
    { label: "Subjects",     href: "/subjects",      icon: <BookOpen      className="w-5 h-5" /> },
    { label: "Planner",      href: "/planner",       icon: <CalendarDays  className="w-5 h-5" /> },
    { label: "Test Tracker", href: "/test-tracker",  icon: <ClipboardList className="w-5 h-5" /> },
    { label: "Leaderboard",  href: "/leaderboard",   icon: <Trophy        className="w-5 h-5" /> },
    { label: "Notes",        href: "/notes",         icon: <FolderOpen    className="w-5 h-5" /> },
    { label: "Profile",      href: "/profile",       icon: <User          className="w-5 h-5" /> },
  ];

  if (user?.role === "admin" || user?.role === "super_admin") {
    navItems.push({ label: "Admin", href: "/admin", icon: <Settings className="w-5 h-5" /> });
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between hidden md:flex shrink-0">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-border">
            <h2 className="text-xl font-bold tracking-tight text-primary">EdTech Cockpit</h2>
          </div>
          <nav className="p-4 space-y-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                location.startsWith(item.href) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-card-border hover:text-foreground"
              }`}>
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-md bg-muted/50">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.fullName.charAt(0)}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{user?.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-card flex items-center justify-around px-4 z-50">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
            location.startsWith(item.href) ? "text-primary" : "text-muted-foreground"
          }`}>
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Pomodoro Widget */}
      <PomodoroWidget />
    </div>
  );
}
