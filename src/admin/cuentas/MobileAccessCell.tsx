import { useState } from "react";
import { api, ApiError } from "../../ui/api";
import type { Employee } from "../../../shared/contracts/equipo";
import type { LinkSecret } from "../../../shared/contracts/access";
import { LinkSecretDialog } from "./LinkSecretDialog";
import { ConfirmDialog } from "./Modal";

const STATUS = {
  none: { label: "Sin enlace", fg: "#475467", bg: "#F2F4F7" },
  active: { label: "Activo", fg: "#095C4F", bg: "#E0F4EF" },
  revoked: { label: "Revocado", fg: "#B54708", bg: "#FFFAEB" },
} as const;

const small =
  "inline-flex h-8 items-center rounded-lg border border-line bg-white px-2.5 text-[13px] font-bold text-ink-2 hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Celda "Acceso móvil" de la tabla de empleados (ACC-06, ACC-07): estado del enlace personal y sus acciones
 * (Crear enlace, Rotar, Revocar). Al crear o rotar muestra el enlace una sola vez en `LinkSecretDialog`.
 * `onChanged` se llama cuando el estado cambió en el servidor: al revocar, enseguida; al crear o rotar,
 * cuando se cierra el diálogo del enlace (así la tabla no se recarga con el diálogo abierto).
 */
export function MobileAccessCell({ employee, onChanged }: { employee: Employee; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<LinkSecret | null>(null);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);
  const status = STATUS[employee.mobile_access];
  const canCreate = employee.state === "Activo";
  const linkId = employee.mobile_link_id;

  async function run(action: "create" | "rotate" | "revoke") {
    setBusy(true);
    setError("");
    try {
      if (action === "revoke") {
        await api(`/access-links/${linkId}/revoke`, { method: "POST" });
        setConfirm(null);
        onChanged();
      } else {
        const result =
          action === "create"
            ? await api<LinkSecret>("/access-links", { body: { kind: "mobile", employee_id: employee.id } })
            : await api<LinkSecret>(`/access-links/${linkId}/rotate`, { method: "POST" });
        setConfirm(null);
        setSecret(result);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar la acción. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold"
        style={{ color: status.fg, background: status.bg }}
      >
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: status.fg }} />
        {status.label}
      </span>
      {employee.mobile_access === "active" && linkId ? (
        <>
          <button type="button" className={small} disabled={busy || !canCreate} onClick={() => { setError(""); setConfirm("rotate"); }} aria-label={`Rotar el enlace móvil de ${employee.name}`}>
            Rotar
          </button>
          <button type="button" className={`${small} text-danger hover:bg-danger-soft`} disabled={busy} onClick={() => { setError(""); setConfirm("revoke"); }} aria-label={`Revocar el enlace móvil de ${employee.name}`}>
            Revocar
          </button>
        </>
      ) : (
        <button
          type="button"
          className={small}
          disabled={busy || !canCreate}
          title={canCreate ? undefined : "Solo se puede crear el enlace de un empleado activo."}
          onClick={() => void run("create")}
          aria-label={`Crear enlace móvil para ${employee.name}`}
        >
          {busy ? "Creando…" : "Crear enlace"}
        </button>
      )}
      {error && !confirm && (
        <span role="alert" className="basis-full text-xs font-semibold text-danger">
          {error}
        </span>
      )}

      {confirm === "rotate" && (
        <ConfirmDialog
          title="Rotar el enlace"
          confirmLabel="Rotar enlace"
          busy={busy}
          error={error}
          onConfirm={() => void run("rotate")}
          onCancel={() => setConfirm(null)}
        >
          El enlace actual de {employee.name} dejará de funcionar y su teléfono perderá el acceso hasta que abra el enlace nuevo.
        </ConfirmDialog>
      )}
      {confirm === "revoke" && (
        <ConfirmDialog
          title="Revocar el acceso móvil"
          confirmLabel="Revocar acceso"
          danger
          busy={busy}
          error={error}
          onConfirm={() => void run("revoke")}
          onCancel={() => setConfirm(null)}
        >
          {employee.name} dejará de ver sus obras en el teléfono. Podrás crear un enlace nuevo cuando quieras.
        </ConfirmDialog>
      )}
      {secret && (
        <LinkSecretDialog
          title={`Enlace móvil de ${employee.name}`}
          path={secret.path}
          intro={`Envíaselo a ${employee.name} o pídele que escanee el código con su teléfono. Abre su vista móvil sin contraseña.`}
          note="Dura 90 días en el teléfono. Si se pierde o lo ve otra persona, rótalo o revócalo desde aquí."
          onClose={() => {
            setSecret(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
