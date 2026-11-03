import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { useAuth } from "../../ui/auth";
import { Banner, Button, Empty, PageHeader, Segmented, initials, useFlash } from "../../ui/components";
import { TextField } from "../../auth/TextField";
import type { Account, ActivationLink, Role } from "../../../shared/contracts/auth";
import { LinkSecretDialog, type LinkSecretDialogProps } from "./LinkSecretDialog";
import { ConfirmDialog, Modal } from "../../ui/Modal";

// Cuentas (AUT-03..06, AUT-08): lista, invitar, cambiar rol, desactivar y restablecer. Solo administración.

type AccountState = "Activa" | "Pendiente de activar" | "Desactivada";
const stateOf = (a: Account): AccountState => (!a.active ? "Desactivada" : a.registered ? "Activa" : "Pendiente de activar");
const STATE_STYLE: Record<AccountState, { fg: string; bg: string }> = {
  Activa: { fg: "#095C4F", bg: "#E0F4EF" },
  "Pendiente de activar": { fg: "#B54708", bg: "#FFFAEB" },
  Desactivada: { fg: "#475467", bg: "#F2F4F7" },
};
const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", office: "Oficina" };
const ROLE_STYLE: Record<Role, { fg: string; bg: string; border: string; avBg: string; avFg: string }> = {
  admin: { fg: "#1F2A3D", bg: "#E8ECF2", border: "#D5DBE5", avBg: "#1F2A3D", avFg: "#FFFFFF" },
  office: { fg: "#344054", bg: "#FFFFFF", border: "#EAECF0", avBg: "#FFF1E7", avFg: "#9A3412" },
};

const COLUMNS = "grid grid-cols-[minmax(240px,1.3fr)_minmax(220px,1fr)_170px_190px_minmax(240px,auto)] items-center";
const rowButton =
  "inline-flex h-8 items-center rounded-lg border border-line bg-white px-2.5 text-[13px] font-bold text-ink-2 hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-50";

type Dialog =
  | { type: "invite" }
  | { type: "deactivate"; account: Account }
  | { type: "reset"; account: Account };
type Secret = Pick<LinkSecretDialogProps, "title" | "intro" | "note"> & { path: string };

export default function Cuentas() {
  const { user: me } = useAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const { flash, node } = useFlash(3500);

  const load = useCallback(async () => {
    try {
      setAccounts(await api<Account[]>("/accounts"));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "No se pudieron cargar las cuentas. Revisa tu conexión.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (accounts ?? []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [accounts, query]);

  const close = () => {
    setDialog(null);
    setActionError("");
  };

  async function patch(a: Account, body: Partial<Pick<Account, "role" | "active">>, done: string) {
    setBusy(a.id);
    setActionError("");
    try {
      await api(`/accounts/${a.id}`, { method: "PATCH", body });
      await load();
      close();
      flash(done);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "No se pudo guardar el cambio. Intenta de nuevo.";
      if (dialog) setActionError(message);
      else flash(message, "danger");
    } finally {
      setBusy(null);
    }
  }

  async function reset(a: Account) {
    setBusy(a.id);
    setActionError("");
    try {
      const link = await api<ActivationLink>(`/accounts/${a.id}/reset`, { method: "POST" });
      close();
      setSecret({
        title: `Enlace para ${a.name}`,
        path: link.activationPath,
        intro: a.registered
          ? `Con este enlace ${a.name} elige una contraseña nueva. Cópialo y pásaselo; no se envía ningún correo.`
          : `Este enlace reemplaza la invitación anterior de ${a.name}. Cópialo y pásaselo; no se envía ningún correo.`,
        note: "Vence en 2 horas y solo sirve una vez. Al usarlo se cierran las sesiones de esa cuenta.",
      });
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "No se pudo generar el enlace. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Cuentas" subtitle="Quién puede entrar a Planner. Las personas se invitan con un enlace que se comparte a mano." />
      <section aria-label="Cuentas" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 w-60 max-w-full items-center gap-2 rounded-lg border border-line bg-white px-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                aria-label="Buscar cuenta"
                placeholder="Buscar cuenta…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm"
              />
            </label>
            {accounts && (
              <span className="rounded-md bg-fill px-2 py-0.5 text-xs font-bold text-muted">
                {accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDialog({ type: "invite" })}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-bold text-white hover:bg-navy"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Invitar
          </button>
        </div>

        {loadError && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <Banner tone="danger">{loadError}</Banner>
            </div>
            <Button onClick={() => void load()}>Reintentar</Button>
          </div>
        )}

        {!accounts && !loadError && (
          <p role="status" className="m-0 border-t border-line px-4 py-10 text-center text-sm text-subtle">
            Cargando cuentas…
          </p>
        )}

        {accounts && (
          <div className="overflow-x-auto border-t border-line">
            <div role="table" aria-label="Cuentas" className="min-w-[1020px]">
              <div role="row" className={`${COLUMNS} h-10 border-b border-line bg-fill-2 text-[13px] font-semibold text-muted`}>
                <span role="columnheader" className="px-4">Nombre</span>
                <span role="columnheader" className="px-3">Correo</span>
                <span role="columnheader" className="px-3">Rol</span>
                <span role="columnheader" className="px-3">Estado</span>
                <span role="columnheader" className="px-3">Acciones</span>
              </div>
              {shown.map((a) => {
                const self = a.id === me?.id;
                const state = stateOf(a);
                const rs = ROLE_STYLE[a.role];
                const ss = STATE_STYLE[state];
                return (
                  <div key={a.id} role="row" className={`${COLUMNS} h-[60px] border-b border-line text-sm ${a.active ? "" : "bg-fill-2/60"}`}>
                    <span role="cell" className="flex min-w-0 items-center gap-3 px-4">
                      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold" style={{ background: rs.avBg, color: rs.avFg }}>
                        {initials(a.name)}
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-semibold">{a.name}</span>
                        {self && <span className="text-xs text-subtle">Tú</span>}
                      </span>
                    </span>
                    <span role="cell" className="truncate px-3 text-muted">{a.email}</span>
                    <span role="cell" className="px-3">
                      <span className="relative inline-flex items-center">
                        <select
                          aria-label={`Rol de ${a.name}`}
                          value={a.role}
                          disabled={self || busy === a.id}
                          title={self ? "No puedes cambiar tu propio rol." : undefined}
                          onChange={(e) => void patch(a, { role: e.target.value as Role }, `Rol de ${a.name} actualizado. Se cerró su sesión.`)}
                          className="h-[30px] cursor-pointer appearance-none rounded-lg border pl-2.5 pr-7 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-70"
                          style={{ color: rs.fg, background: rs.bg, borderColor: rs.border }}
                        >
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={rs.fg} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute right-2.5">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </span>
                    <span role="cell" className="px-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold" style={{ color: ss.fg, background: ss.bg }}>
                        <span aria-hidden className="size-1.5 rounded-full" style={{ background: ss.fg }} />
                        {state}
                      </span>
                    </span>
                    <span role="cell" className="flex flex-wrap items-center gap-1.5 px-3">
                      {a.active && (
                        <button type="button" className={rowButton} disabled={busy === a.id} onClick={() => { setActionError(""); setDialog({ type: "reset", account: a }); }} aria-label={`${a.registered ? "Restablecer contraseña de" : "Generar nuevo enlace para"} ${a.name}`}>
                          {a.registered ? "Restablecer" : "Nuevo enlace"}
                        </button>
                      )}
                      {a.active ? (
                        <button
                          type="button"
                          className={`${rowButton} text-danger hover:bg-danger-soft`}
                          disabled={self || busy === a.id}
                          title={self ? "No puedes desactivar tu propia cuenta." : undefined}
                          onClick={() => { setActionError(""); setDialog({ type: "deactivate", account: a }); }}
                          aria-label={`Desactivar la cuenta de ${a.name}`}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button type="button" className={rowButton} disabled={busy === a.id} onClick={() => void patch(a, { active: true }, `Cuenta de ${a.name} activada.`)} aria-label={`Activar la cuenta de ${a.name}`}>
                          Activar
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {shown.length === 0 && (
              <Empty title={accounts.length ? "Ninguna cuenta coincide" : "Todavía no hay cuentas"}>
                {accounts.length ? "Prueba con otro nombre o correo." : "Invita a la primera persona con el botón Invitar."}
              </Empty>
            )}
          </div>
        )}
        <div className="border-t border-line px-4 py-3 text-[13px] text-muted">
          Cambiar el rol o desactivar una cuenta cierra sus sesiones. No se envían correos: copia el enlace y compártelo por el medio que prefieras.
        </div>
      </section>

      {dialog?.type === "invite" && (
        <InviteDialog
          onClose={close}
          onInvited={(a, link) => {
            close();
            void load();
            setSecret({
              title: `Invitación para ${a.name}`,
              path: link.activationPath,
              intro: `Cópialo y compártelo con ${a.name} (por ejemplo, por WhatsApp). No se envía ningún correo.`,
              note: "Vence en 48 horas y solo sirve una vez. Si vence, genera uno nuevo desde la tabla.",
            });
          }}
        />
      )}
      {dialog?.type === "deactivate" && (
        <ConfirmDialog
          title="Desactivar cuenta"
          confirmLabel="Desactivar"
          danger
          busy={busy === dialog.account.id}
          error={actionError}
          onConfirm={() => void patch(dialog.account, { active: false }, `Cuenta de ${dialog.account.name} desactivada.`)}
          onCancel={close}
        >
          {dialog.account.name} no podrá entrar y se cerrarán todas sus sesiones ahora mismo. Puedes activarla de nuevo cuando quieras.
        </ConfirmDialog>
      )}
      {dialog?.type === "reset" && (
        <ConfirmDialog
          title={dialog.account.registered ? "Restablecer contraseña" : "Generar nuevo enlace"}
          confirmLabel="Generar enlace"
          busy={busy === dialog.account.id}
          error={actionError}
          onConfirm={() => void reset(dialog.account)}
          onCancel={close}
        >
          Se genera un enlace de 2 horas para {dialog.account.name}. Los enlaces anteriores que no se hayan usado dejan de funcionar.
        </ConfirmDialog>
      )}
      {secret && <LinkSecretDialog {...secret} onClose={() => setSecret(null)} />}
      {node}
    </>
  );
}

const ROLE_HINT: Record<Role, string> = {
  office: "Gestiona proyectos, equipo, avisos e importaciones.",
  admin: "Además fija prioridades, gestiona cuentas y enlaces, y configura el mural.",
};

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (account: { name: string }, link: ActivationLink) => void }) {
  const [role, setRole] = useState<Role>("office");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      const link = await api<ActivationLink>("/accounts", { body: { name, email, role } });
      onInvited({ name }, link);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la invitación. Intenta de nuevo.");
      setBusy(false);
    }
  }
  return (
    <Modal title="Invitar a una persona" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Nombre" name="name" autoComplete="off" data-autofocus required maxLength={160} />
        <TextField label="Correo" name="email" type="email" autoComplete="off" required maxLength={254} />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-ink-2">Rol</span>
          <Segmented<Role>
            label="Rol"
            value={role}
            onChange={setRole}
            options={[
              { value: "office", label: ROLE_LABEL.office },
              { value: "admin", label: ROLE_LABEL.admin },
            ]}
          />
          <p className="m-0 text-[13px] text-subtle">{ROLE_HINT[role]}</p>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Creando…" : "Crear invitación"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
