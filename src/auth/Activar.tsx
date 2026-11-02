import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../ui/api";
import { useAuth } from "../ui/auth";
import { Banner, Button } from "../ui/components";
import { AuthShell } from "./AuthShell";
import { TextField } from "./TextField";
import { PASSWORD_MAX as MAX, PASSWORD_MIN as MIN, passwordErrors } from "./password";

// Aceptar una invitación o un restablecimiento: /activar#token (AUT-03, AUT-04, AUT-09).
export default function Activar() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  // El token se lee del fragmento al montar y se borra de la barra de direcciones (no queda en el historial).
  const [token] = useState(() => window.location.hash.replace(/^#/, ""));
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const found = passwordErrors(password, String(f.get("confirm") ?? ""));
    setErrors(found);
    setError("");
    if (found.password || found.confirm) return;
    setBusy(true);
    try {
      await api("/auth/accept", { body: { token, name, password } });
      await refresh();
      navigate("/proyectos", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo activar la cuenta. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (token.length < 20)
    return (
      <AuthShell title="Enlace no válido" subtitle="Este enlace está incompleto, expiró o ya se usó. Pide a administración uno nuevo.">
        <Link to="/login" className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-line bg-white text-[15px] font-bold text-ink-2 no-underline hover:bg-fill-2">
          Ir al inicio de sesión
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell
      title="Activa tu cuenta"
      subtitle="Confirma tu nombre y elige una contraseña para entrar a Electsun Planner."
      footer="El enlace sirve una sola vez. Si ya lo usaste o venció, pide uno nuevo a administración."
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Nombre" name="name" autoComplete="name" autoFocus required maxLength={160} />
        <TextField
          label="Contraseña"
          name="password"
          autoComplete="new-password"
          reveal
          required
          maxLength={MAX}
          hint={`Mínimo ${MIN} caracteres.`}
          error={errors.password}
        />
        <TextField label="Repite la contraseña" name="confirm" autoComplete="new-password" reveal required maxLength={MAX} error={errors.confirm} />
        {error && <Banner tone="danger">{error}</Banner>}
        <Button variant="primary" disabled={busy} type="submit" className="h-11 w-full text-[15px]">
          {busy ? "Activando…" : "Activar cuenta"}
        </Button>
      </form>
    </AuthShell>
  );
}
