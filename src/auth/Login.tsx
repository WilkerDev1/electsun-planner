import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../ui/api";
import { useAuth } from "../ui/auth";
import { Banner, Button } from "../ui/components";

// Inicio de sesión (AUT-01). La fase F1·A lo pule según el sistema visual.
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
      await api("/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-[24px] border border-line bg-white p-8 shadow-[var(--shadow-card)]">
        <h1 className="m-0 text-2xl font-extrabold">Electsun Planner</h1>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Correo
          <input name="email" type="email" autoComplete="username" required className="h-11 rounded-xl border border-line px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required className="h-11 rounded-xl border border-line px-3 font-normal" />
        </label>
        {error && <Banner tone="danger">{error}</Banner>}
        <Button variant="primary" disabled={busy} type="submit">Entrar</Button>
      </form>
    </main>
  );
}
