import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { api } from "./api";

interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/auth/me")
      .then((data) => {
        setUser(data);
        try { localStorage.setItem("librarium_user", JSON.stringify(data)); } catch {}
      })
      .catch(() => {
        if (!navigator.onLine) {
          try {
            const cached = localStorage.getItem("librarium_user");
            if (cached) { setUser(JSON.parse(cached)); return; }
          } catch {}
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setUser(data.user);
      return null;
    } catch (e: any) {
      return e.message || "Ошибка входа";
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    try { localStorage.removeItem("librarium_user"); } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ textAlign: "center", padding: 48, color: "#666" }}>Загрузка...</div>;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
