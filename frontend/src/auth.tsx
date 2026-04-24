import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Navigate } from "react-router-dom";
import * as authApi from "./api/endpoints/auth";
import type { User } from "./api/types";

const LOCALSTORAGE_AUTH_KEY = "librarium_user";
const LOCALSTORAGE_AUTH_SCHEMA_VERSION = 1;

interface StoredAuth {
  schemaVersion: number;
  user: User;
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

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .getMe()
      .then((data) => {
        setUser(data);
        try {
          const entry: StoredAuth = { schemaVersion: LOCALSTORAGE_AUTH_SCHEMA_VERSION, user: data };
          localStorage.setItem(LOCALSTORAGE_AUTH_KEY, JSON.stringify(entry));
        } catch {}
      })
      .catch(() => {
        if (!navigator.onLine) {
          try {
            const raw = localStorage.getItem(LOCALSTORAGE_AUTH_KEY);
            if (raw) {
              const stored: StoredAuth = JSON.parse(raw);
              if (stored.schemaVersion === LOCALSTORAGE_AUTH_SCHEMA_VERSION && stored.user) {
                setUser(stored.user);
                return;
              }
            }
          } catch {}
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    try {
      const data = await authApi.login({ username, password });
      setUser(data.user);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : "Ошибка входа";
    }
  }

  async function logout() {
    await authApi.logout().catch((err) => console.warn("Logout request failed:", err));
    setUser(null);
    try {
      localStorage.removeItem(LOCALSTORAGE_AUTH_KEY);
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children, adminOnly = false }: Readonly<{ children: ReactNode; adminOnly?: boolean }>) {
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
