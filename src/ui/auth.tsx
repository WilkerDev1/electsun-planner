import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "./api";
import type { Me, User } from "../../shared/contracts/auth";

type AuthState = { user: User | null; today: string; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>({ user: null, today: "" });
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/auth/me"));
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    // Los logotipos cacheados por el Service Worker no deben sobrevivir a la sesión (EQP-07).
    try {
      if (typeof caches !== "undefined") await caches.delete("company-logos");
    } catch {
      /* sin caché o sin permiso: nada que limpiar */
    }
    setMe((m) => ({ ...m, user: null }));
  }, []);
  useEffect(() => {
    void refresh();
    // Sesión caducada (401 en cualquier llamada): se recarga /auth/me y RequireAuth lleva al login.
    const onUnauthorized = () => void refresh();
    window.addEventListener("planner:unauthorized", onUnauthorized);
    // "Hoy" se renueva a medianoche aunque la pestaña siga abierta.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => {
        void refresh();
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => {
      window.removeEventListener("planner:unauthorized", onUnauthorized);
      clearTimeout(timer);
    };
  }, [refresh]);
  return <AuthContext.Provider value={{ ...me, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}

/** Protege las rutas de administración. `adminOnly` para Cuentas (ROL-02). */
export function RequireAuth({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/proyectos" replace />;
  return <>{children}</>;
}
