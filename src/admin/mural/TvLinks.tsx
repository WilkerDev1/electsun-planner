import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button } from "../../ui/components";
import { ConfirmDialog } from "../../ui/Modal";
import { LinkSecretDialog } from "../cuentas/LinkSecretDialog";
import type { AccessLink, LinkSecret } from "../../../shared/contracts/access";
import { Section, ago, inputClass, smallButton } from "./ui";

// Pantallas de TV (ACC-01..03, ACC-07): crear, rotar y revocar enlaces. Solo administración.

const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar la acción. Intenta de nuevo.");

type Action = { kind: "rotate" | "revoke"; link: AccessLink };

export function TvLinksCard({ canEdit }: { canEdit: boolean }) {
  const [links, setLinks] = useState<AccessLink[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ title: string; path: string } | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);

  const load = useCallback(async () => {
    if (!canEdit) return;
    try {
      setLinks(await api<AccessLink[]>("/access-links?kind=tv"));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e));
    }
  }, [canEdit]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<LinkSecret>("/access-links", { body: { kind: "tv", name: name.trim() } });
      setName("");
      setSecret({ title: `Enlace de ${r.link.name}`, path: r.path });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(a: Action) {
    setBusy(true);
    setError("");
    try {
      if (a.kind === "revoke") {
        await api(`/access-links/${a.link.id}/revoke`, { method: "POST" });
        setConfirm(null);
        await load();
      } else {
        const r = await api<LinkSecret>(`/access-links/${a.link.id}/rotate`, { method: "POST" });
        setConfirm(null);
        setSecret({ title: `Enlace nuevo de ${r.link.name}`, path: r.path });
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Pantallas de TV"
      hint="Cada TV tiene su propio enlace. Ábrelo en el navegador de la pantalla: se actualiza solo y no necesita usuario ni contraseña."
    >
      {!canEdit ? (
        <Banner tone="info">Solo la administración puede crear, rotar o revocar los enlaces de las pantallas.</Banner>
      ) : (
        <>
          {loadError && <Banner tone="danger">{loadError}</Banner>}
          {links?.length === 0 && <p className="m-0 text-sm text-subtle">Todavía no hay pantallas. Crea el enlace de la primera.</p>}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {links?.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-fill-2 px-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span className="break-words">{l.name}</span>
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold"
                      style={l.active ? { color: "#095C4F", background: "#E0F4EF" } : { color: "#B54708", background: "#FFFAEB" }}
                    >
                      {l.active ? "Activa" : "Revocada"}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{ago(l.last_seen_at)}</span>
                </span>
                <button type="button" className={smallButton} disabled={busy} aria-label={`${l.active ? "Rotar" : "Reactivar"} el enlace de ${l.name}`} onClick={() => { setError(""); setConfirm({ kind: "rotate", link: l }); }}>
                  {l.active ? "Rotar" : "Reactivar"}
                </button>
                {l.active && (
                  <button type="button" className={`${smallButton} text-danger hover:bg-danger-soft`} disabled={busy} aria-label={`Revocar el enlace de ${l.name}`} onClick={() => { setError(""); setConfirm({ kind: "revoke", link: l }); }}>
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={create} className="flex gap-2">
            <input
              type="text"
              aria-label="Nombre de la nueva pantalla"
              placeholder="Nombre, por ejemplo Sala de juntas"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="h-10 rounded-[10px]">
              Nueva pantalla
            </Button>
          </form>
          {error && !confirm && <Banner tone="danger">{error}</Banner>}
        </>
      )}

      {confirm?.kind === "rotate" && (
        <ConfirmDialog
          title={confirm.link.active ? "Rotar el enlace" : "Reactivar la pantalla"}
          confirmLabel={confirm.link.active ? "Rotar enlace" : "Reactivar"}
          busy={busy}
          error={error}
          onConfirm={() => void run(confirm)}
          onCancel={() => setConfirm(null)}
        >
          {confirm.link.active
            ? `El enlace actual de ${confirm.link.name} dejará de funcionar y la TV se quedará sin datos hasta que abras el enlace nuevo en ella.`
            : `Se creará un enlace nuevo para ${confirm.link.name}. Tendrás que abrirlo en esa TV.`}
        </ConfirmDialog>
      )}
      {confirm?.kind === "revoke" && (
        <ConfirmDialog
          title="Revocar la pantalla"
          confirmLabel="Revocar pantalla"
          danger
          busy={busy}
          error={error}
          onConfirm={() => void run(confirm)}
          onCancel={() => setConfirm(null)}
        >
          {confirm.link.name} mostrará “Este enlace fue desactivado” y dejará de recibir datos. Podrás reactivarla con un enlace nuevo.
        </ConfirmDialog>
      )}
      {secret && (
        <LinkSecretDialog
          title={secret.title}
          path={secret.path}
          intro="Abre este enlace en el navegador de la TV (o escanea el código con el teléfono para probarlo). El mural se muestra sin usuario ni contraseña."
          note="Dura 30 días en la pantalla. Si se pierde o lo ve otra persona, rótalo o revócalo desde aquí."
          onClose={() => {
            setSecret(null);
            void load();
          }}
        />
      )}
    </Section>
  );
}
