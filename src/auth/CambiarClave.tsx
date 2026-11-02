import { useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../ui/api";
import { Banner, Button, Card, PageHeader, useFlash } from "../ui/components";
import { TextField } from "./TextField";
import { PASSWORD_MAX, PASSWORD_MIN, passwordErrors } from "./password";

// Cambio de contraseña propio (AUT-05): pide la actual y cierra las demás sesiones.
export default function CambiarClave() {
  const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { flash, node } = useFlash(3500);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = String(f.get("current") ?? "");
    const password = String(f.get("password") ?? "");
    const found = { ...passwordErrors(password, String(f.get("confirm") ?? "")), ...(current ? {} : { current: "Escribe tu contraseña actual." }) };
    setErrors(found);
    setError("");
    if (found.current || found.password || found.confirm) return;
    setBusy(true);
    try {
      await api("/auth/password", { body: { current, password } });
      form.current?.reset();
      flash("Contraseña actualizada. Se cerraron tus otras sesiones.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors({ current: err.message });
      else setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Cambiar contraseña" subtitle="Al cambiarla se cierran tus sesiones en otros dispositivos." />
      <Card className="max-w-lg p-6">
        <form ref={form} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <TextField label="Contraseña actual" name="current" autoComplete="current-password" reveal required maxLength={PASSWORD_MAX} error={errors.current} />
          <TextField
            label="Contraseña nueva"
            name="password"
            autoComplete="new-password"
            reveal
            required
            maxLength={PASSWORD_MAX}
            hint={`Mínimo ${PASSWORD_MIN} caracteres.`}
            error={errors.password}
          />
          <TextField label="Repite la contraseña nueva" name="confirm" autoComplete="new-password" reveal required maxLength={PASSWORD_MAX} error={errors.confirm} />
          {error && <Banner tone="danger">{error}</Banner>}
          <div>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </div>
        </form>
      </Card>
      {node}
    </>
  );
}
