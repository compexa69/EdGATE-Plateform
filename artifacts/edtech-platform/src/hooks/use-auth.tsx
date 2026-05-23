import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  mobile: string | null;
  role: "student" | "admin" | "super_admin";
  status: "pending_approval" | "approved" | "suspended";
  avatarUrl: string | null;
  createdAt: string;
}

interface AuthContextType {
  user: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token?: string) => void;
  logout: () => void;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, mobile, role, status, avatar_url, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    mobile: data.mobile ?? null,
    role: data.role,
    status: data.status,
    avatarUrl: data.avatar_url ?? null,
    createdAt: data.created_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfile(s: Session | null) {
    if (!s?.user) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    const profile = await fetchProfile(s.user.id);
    setUser(profile);
    setIsLoading(false);
  }

  const refetchUser = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.user) {
      const profile = await fetchProfile(s.user.id);
      setUser(profile);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      loadProfile(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = (_token?: string) => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      loadProfile(s);
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const isAuthenticated = !!session && !!user;

  return (
    <AuthContext.Provider value={{ user, session, isAuthenticated, isLoading, login, logout, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
