import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Field, Toggle } from "../../ui/components";
import { Modal } from "../../ui/Modal";
import { LEVEL_ICONS, plural, type LevelIcon, type LevelPerm } from "../../../shared/domain";
import type { LevelItem } from "../../../shared/contracts/equipo";
import { LEVEL_ICON } from "../equipo/model";
import { Section, inputClass, smallButton } from "../mural/ui";

// Catálogo de niveles de empleado (NIV-01): permisos operativos, orden, título de grupo y estado activo.
// Solo la administración edita; Oficina lo ve en solo lectura. El nivel «Oficina» solo se puede reordenar.

const message = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo guardar el nivel. Intenta de nuevo.");
type Flash = (text: string, tone?: "ok" | "danger") => void;

const PERM_LABELS: { key: LevelPerm; label: string; help: string }[] = [
  { key: "can_lead_team", label: "Lidera equipo", help: "Puede ser encargado de un equipo de obra." },
  { key: "is_supervisor", label: "Supervisa", help: "Recorre todas las obras y sale como supervisor." },
  { key: "can_use_mobile", label: "Acceso móvil", help: "Puede recibir un enlace para ver sus obras en el teléfono." },
  { key: "is_field", label: "Sale a obra", help: "Trabaja en campo y necesita equipo asignado." },
];

const ICON_LABELS: Record<LevelIcon, string> = {
  shield: "Escudo",
  flag: "Bandera",
  wrench: "Herramienta",
  user: "Persona",
  building: "Edificio",
};

export function LevelsCard({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
  const [items, setItems] = useState<LevelItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resets, setResets] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<LevelItem[]>("/levels"));
      setLoadError("");
    } catch (e) {
      setLoadError(message(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(
    item: LevelItem,
    patch: Partial<Pick<LevelItem, "name" | "group_label" | "sort" | "can_lead_team" | "is_supervisor" | "can_use_mobile" | "is_field" | "active">>,
  ) {
    setBusy(true);
    try {
      await api(`/levels/${item.id}`, { method: "PATCH", body: { version: item.version, ...patch } });
      flash("Nivel guardado");
    } catch (e) {
      setResets((n) => n + 1);
      flash(message(e), "danger");
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function move(index: number, step: -1 | 1) {
    if (!items) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved);
    setBusy(true);
    try {
      for (const [i, l] of next.entries())
        if (l.sort !== i + 1) await api(`/levels/${l.id}`, { method: "PATCH", body: { version: l.version, sort: i + 1 } });
      flash("Orden guardado");
    } catch (e) {
      flash(message(e), "danger");
    } finally {
      await load();
      setBusy(false);
    }
  }

  return (
    <Section
      title="Niveles"
      hint="Los niveles de los empleados, el orden en que se agrupan en Equipo y lo que cada nivel puede hacer en obra y en el teléfono. Las cuentas de acceso web se administran aparte, en Cuentas."
      aside={
        canEdit && (
          <button type="button" onClick={() => setAdding(true)} className={smallButton}>
            Agregar nivel
          </button>
        )
      }
    >
      {!canEdit && <Banner tone="info">Solo la administración puede cambiar los niveles.</Banner>}
      {loadError && <Banner tone="danger">{loadError}</Banner>}
      {items && items.length === 0 && <p className="m-0 text-sm text-muted">Todavía no hay niveles.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items?.map((it, i) => (
          <LevelRow
            key={`${it.id}-${it.version}-${resets}`}
            item={it}
            first={i === 0}
            last={i === items.length - 1}
            canEdit={canEdit}
            busy={busy}
            onSave={(p) => void save(it, p)}
            onMove={(step) => void move(i, step)}
          />
        ))}
      </ul>
      {adding && (
        <AddLevelDialog
          onClose={() => setAdding(false)}
          onCreated={async () => {
            setAdding(false);
            await load();
            flash("Nivel agregado");
          }}
        />
      )}
    </Section>
  );
}

const cell =
  "h-9 rounded-lg border border-line-2 bg-white px-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-fill-2 disabled:text-subtle";

function LevelRow({
  item,
  first,
  last,
  canEdit,
  busy,
  onSave,
  onMove,
}: {
  item: LevelItem;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  busy: boolean;
  onSave: (
    p: Partial<Pick<LevelItem, "name" | "group_label" | "can_lead_team" | "is_supervisor" | "can_use_mobile" | "is_field" | "active">>,
  ) => void;
  onMove: (step: -1 | 1) => void;
}) {
  const [name, setName] = useState(item.name);
  const [group, setGroup] = useState(item.group_label);
  const locked = item.code === "oficina";
  const off = !canEdit || busy || locked;
  const moveOff = !canEdit || busy;
  const moveBtn = "flex size-8 items-center justify-center rounded-lg text-muted hover:bg-fill disabled:opacity-30";

  return (
    <li className={`flex flex-wrap items-end gap-2.5 rounded-xl border border-line bg-fill-2 p-2.5 ${item.active ? "" : "opacity-75"}`}>
      <label className="flex min-w-[140px] flex-[1_1_150px] flex-col gap-0.5 text-[11px] font-semibold text-muted">
        Nombre
        <input
          aria-label={`Nombre del nivel ${item.name}`}
          className={`${cell} font-bold`}
          value={name}
          maxLength={40}
          disabled={off}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={() => {
            const v = name.trim();
            if (!v) setName(item.name);
            else if (v !== item.name) onSave({ name: v });
          }}
        />
      </label>
      <label className="flex min-w-[140px] flex-[1_1_160px] flex-col gap-0.5 text-[11px] font-semibold text-muted">
        Título de grupo
        <input
          aria-label={`Título de grupo de ${item.name}`}
          className={cell}
          value={group}
          maxLength={60}
          disabled={off}
          onChange={(e) => setGroup(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={() => {
            const v = group.trim();
            if (!v) setGroup(item.group_label);
            else if (v !== item.group_label) onSave({ group_label: v });
          }}
        />
      </label>
      {PERM_LABELS.map((p) => (
        <span key={p.key} className="flex flex-col items-start gap-1 text-[11px] font-semibold text-muted">
          {p.label}
          <Toggle
            on={item[p.key]}
            label={`${item.name}: ${p.label}`}
            disabled={off}
            onChange={(v) => onSave({ [p.key]: v })}
          />
        </span>
      ))}
      <span className="flex flex-col items-start gap-1 text-[11px] font-semibold text-muted">
        Activo
        <Toggle
          on={item.active}
          label={`${item.name}: Activo`}
          disabled={off}
          onChange={(v) => onSave({ active: v })}
        />
      </span>
      <span className="ml-auto flex items-center gap-1">
        <span className="mr-1 text-xs font-semibold text-muted">
          {plural(item.person_count, "persona", "personas")}
          {locked ? " · Fijo" : ""}
        </span>
        {canEdit && (
          <>
            <button type="button" aria-label={`Subir ${item.name}`} title="Subir" disabled={moveOff || first} onClick={() => onMove(-1)} className={moveBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
            <button type="button" aria-label={`Bajar ${item.name}`} title="Bajar" disabled={moveOff || last} onClick={() => onMove(1)} className={moveBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </>
        )}
      </span>
    </li>
  );
}

function AddLevelDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [groupLabel, setGroupLabel] = useState("");
  const [icon, setIcon] = useState<LevelIcon>("wrench");
  const [canLeadTeam, setCanLeadTeam] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [canUseMobile, setCanUseMobile] = useState(true);
  const [isField, setIsField] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/levels", {
        method: "POST",
        body: {
          name: name.trim(),
          group_label: groupLabel.trim() || name.trim(),
          icon,
          can_lead_team: canLeadTeam,
          is_supervisor: isSupervisor,
          can_use_mobile: canUseMobile,
          is_field: isField,
        },
      });
      await onCreated();
    } catch (e) {
      setError(message(e));
      setSaving(false);
    }
  }

  const permState: Record<LevelPerm, [boolean, (v: boolean) => void]> = {
    can_lead_team: [canLeadTeam, setCanLeadTeam],
    is_supervisor: [isSupervisor, setIsSupervisor],
    can_use_mobile: [canUseMobile, setCanUseMobile],
    is_field: [isField, setIsField],
  };

  return (
    <Modal title="Agregar nivel" subtitle="Aparecerá como opción al asignar roles a los empleados." onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <input
              className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold outline-none"
              value={name}
              maxLength={40}
              required
              onChange={(e) => setName(e.target.value)}
              data-autofocus
            />
          </Field>
          <Field label="Título de grupo" hint="Si lo dejas vacío se usa el nombre.">
            <input
              className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold outline-none"
              value={groupLabel}
              maxLength={60}
              placeholder={name.trim() || "Ej. Técnicos senior"}
              onChange={(e) => setGroupLabel(e.target.value)}
            />
          </Field>
        </div>
        <label className="flex flex-col gap-1 text-[12px] font-bold uppercase tracking-wide text-subtle">
          Icono
          <select className={`${inputClass} h-10 normal-case`} value={icon} onChange={(e) => setIcon(e.target.value as LevelIcon)}>
            {LEVEL_ICONS.map((ic) => (
              <option key={ic} value={ic}>
                {ICON_LABELS[ic]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="m-0 flex flex-col gap-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-subtle">Permisos operativos</legend>
          {PERM_LABELS.map((p) => {
            const [val, setVal] = permState[p.key];
            return (
              <label key={p.key} className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex flex-col">
                  <span className="text-sm font-bold text-ink">{p.label}</span>
                  <span className="text-xs text-subtle">{p.help}</span>
                </span>
                <input type="checkbox" className="size-4 accent-[#1F2A3D]" checked={val} onChange={(e) => setVal(e.target.checked)} />
              </label>
            );
          })}
        </fieldset>
        <div className="flex items-center gap-2 text-xs text-subtle">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={LEVEL_ICON[icon]} />
          </svg>
          <span>Vista previa: {name.trim() || "Nuevo nivel"} ({groupLabel.trim() || name.trim() || "Grupo"})</span>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {saving ? "Guardando…" : "Agregar nivel"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
