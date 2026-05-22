import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Home, BookOpen, User, LogOut, Settings, Trophy, CalendarDays, FolderOpen, ClipboardList, ScanLine, Sun, Moon, Bell, Check } from "lucide-react";
import { PomodoroWidget } from "@/components/pomodoro";
import { useThemeMode } from "@/App";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscribeToTable } from "@/lib/supabase";

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function getAuthToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("edtech_token") : null;
}

async function fetchNotifications(): Promise<AppNotification[]> {
  const token = getAuthToken();
  const res = await fetch("/api/notifications", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return res.json();
}

async function markAllRead(): Promise<void> {
  const token = getAuthToken();
  await fetch("/api/notifications/read-all", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 5 * 60_000,
    enabled: !!user,
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToTable<Record<string, unknown>>(
      "notifications",
      `user_id=eq.${user.id}`,
      () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      },
    );
    return unsub;
  }, [user?.id, queryClient]);

  const markAllMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpen = () => {
    setOpen((prev) => !prev);
    if (!open && unreadCount > 0) {
      markAllMutation.mutate();
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const typeColor = (type: string) => {
    if (type === "user_approved") return "bg-success/20 text-success";
    if (type === "new_registration") return "bg-warning/20 text-warning";
    if (type === "streak_milestone") return "bg-accent/20 text-accent";
    return "bg-primary/20 text-primary";
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-[420px] bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="font-semibold text-sm text-foreground">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-10 flex flex-col items-center text-muted-foreground gap-2">
                <Bell className="w-8 h-8 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${!n.isRead ? "bg-primary" : "bg-muted"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { theme, toggleTheme } = useThemeMode();

  const handleLogout = () => {
    logout();
  };

  const navItems = [
    { label: "Dashboard",    href: "/dashboard",     icon: <Home          className="w-5 h-5" /> },
    { label: "Subjects",     href: "/subjects",      icon: <BookOpen      className="w-5 h-5" /> },
    { label: "Planner",      href: "/planner",       icon: <CalendarDays  className="w-5 h-5" /> },
    { label: "Test Tracker", href: "/test-tracker",  icon: <ClipboardList className="w-5 h-5" /> },
    { label: "QR History",   href: "/qr-history",    icon: <ScanLine      className="w-5 h-5" /> },
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
          <div className="h-16 flex items-center px-6 border-b border-border justify-between">
            <h2 className="text-xl font-bold tracking-tight text-primary">EdTech Cockpit</h2>
            <NotificationBell />
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
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
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
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Mobile top bar with notification bell */}
        <div className="md:hidden sticky top-0 z-40 bg-card/90 backdrop-blur-sm border-b border-border h-11 flex items-center justify-between px-4 shrink-0">
          <span className="text-sm font-bold text-primary">EdTech Cockpit</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <NotificationBell />
          </div>
        </div>
        <div className="flex-1">
          {children}
        </div>
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
