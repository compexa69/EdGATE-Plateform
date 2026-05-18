import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetCurrentUser, type UserProfile } from "@workspace/api-client-react";

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("edtech_token") : null
  );

  const { data: user, isLoading, refetch } = useGetCurrentUser({
    query: {
      enabled: !!token,
      retry: false,
    } as any,
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("edtech_token", token);
    } else {
      localStorage.removeItem("edtech_token");
    }
  }, [token]);

  const login = (newToken: string) => {
    setToken(newToken);
    refetch();
  };

  const logout = () => {
    setToken(null);
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user: user || null, isAuthenticated, isLoading, login, logout }}>
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
