import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../ui/api";
import { useAuth } from "../ui/auth";
import { Banner, Button } from "../ui/components";
import { AuthShell } from "./AuthShell";
import { TextField } from "./TextField";

// Inicio de sesión (AUT-01, AUT-09).
export default function Login() {
  const { user, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/proyectos";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!loading && user) return <Navigate to={from} replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { body: { email: String(f.get("email") ?? "").trim(), password: f.get("password") } });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title="Inicia sesión"
      subtitle="Entra con tu correo y tu contraseña."
      footer="¿No tienes cuenta o olvidaste tu contraseña? Pide a administración un enlace nuevo."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Correo" name="email" type="email" autoComplete="username" autoFocus required maxLength={254} placeholder="nombre@empresa.com" />
        <TextField label="Contraseña" name="password" autoComplete="current-password" reveal required maxLength={128} />
        {error && <Banner tone="danger">{error}</Banner>}
        <Button variant="primary" disabled={busy || loading} type="submit" className="h-11 w-full text-[15px]">
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
