import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Empty, Field, Toggle } from "../../ui/components";
import { BRAND, colorDistance, fold, plural } from "../../../shared/domain";
import type { Company } from "../../../shared/contracts/equipo";
import { ICON, companyCounts, monogram, type TabProps } from "./model";
import { IconButton, Modal, Svg, inputCls } from "./ui";

const GRID = "grid items-center grid-cols-[minmax(240px,1fr)_340px_100px_130px_90px_100px_52px]";
const CLOSE = 60; // misma distancia que usa el servidor (EQP-05)

/** Qué colores se confunden con `color` en el mural: el naranja de la marca u otra empresa. */
function clashes(color: string, company: { id?: string }, all: Company[]) {
  const out: string[] = [];
  if (colorDistance(color, BRAND) < CLOSE) out.push("Parecido al naranja de la marca");
  for (const o of all) if (o.id !== company.id && colorDistance(color, o.color) < CLOSE) out.push(`Parecido a ${o.name}`);
  return out;
}

export function EmpresasTab({ data, query, save, done }: TabProps) {
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const q = fold(query);
  const rows = data.companies.filter((c) => !q || fold(`${c.name} ${c.code}`).includes(q));

  const patch = async (c: Company, body: Partial<Pick<Company, "color" | "active">>, ok: string) => {
    const r = await save(() => api<Company & { warnings: string[] }>(`/companies/${c.id}`, { method: "PATCH", body: { version: c.version, ...body } }), ok);
    if (r) setWarnings(r.warnings);
  };

  return (
    <>
      <div className="flex justify-end px-4 pb-3">
        <Button variant="primary" className="h-9 rounded-lg" onClick={() => setEditing("new")}>
          <Svg d={ICON.plus} stroke={2.4} /> Agregar empresa
        </Button>
      </div>
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 px-4 pb-3">
          <div className="flex-1">
            <Banner tone="warn">{warnings.join(" ")}</Banner>
          </div>
          <Button variant="ghost" onClick={() => setWarnings([])}>Entendido</Button>
        </div>
      )}
      <div className="overflow-x-auto border-t border-line">
        <div role="table" aria-label="Empresas" className="min-w-[1040px]">
          <div role="row" className={`${GRID} h-10 border-b border-line bg-fill-2 text-[13px] font-semibold text-muted`}>
            <span role="columnheader" className="px-4">Empresa</span>
            <span role="columnheader" className="px-3">Color en el mural</span>
            <span role="columnheader" className="px-3 text-right">Activos</span>
            <span role="columnheader" className="px-3 text-right">Por programar</span>
            <span role="columnheader" className="px-3 text-right">Total</span>
            <span role="columnheader" className="px-3">Activa</span>
            <span role="columnheader" aria-label="Acciones" />
          </div>
          {rows.length === 0 && (
            <Empty title={data.companies.length ? "Ninguna empresa coincide" : "Todavía no hay empresas"}>
              {data.companies.length ? "Prueba con otra búsqueda." : "Agrega la primera con «Agregar empresa»."}
            </Empty>
          )}
          {rows.map((c) => {
            const m = monogram(c.color);
            const n = companyCounts(c, data.projects);
            const clash = clashes(c.color, c, data.companies);
            return (
              <div key={c.id} role="row" className={`${GRID} h-[60px] border-b border-line text-sm ${c.active ? "" : "bg-fill-2 opacity-70"}`}>
                <span role="cell" className="flex min-w-0 items-center gap-3 px-4">
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-extrabold" style={{ background: m.bg, color: m.fg }}>{c.code}</span>
                  <span className="flex min-w-0 flex-col leading-snug">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className="text-xs text-subtle">Sigla {c.code}{c.active ? "" : " · Inactiva"}</span>
                  </span>
                </span>
                <span role="cell" className="flex items-center gap-2.5 px-3">
                  <ColorCell company={c} onCommit={(color) => patch(c, { color }, "Color guardado")} />
                  {clash.length > 0 && (
                    <span className="truncate rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn" title={clash.join(". ")}>
                      <span className="sr-only">Aviso: </span>
                      {clash[0]}
                    </span>
                  )}
                </span>
                <span role="cell" className="px-3 text-right font-semibold tabular-nums">{n.active ?? "—"}</span>
                <span role="cell" className="px-3 text-right tabular-nums text-muted">{n.waiting ?? "—"}</span>
                <span role="cell" className="px-3 text-right tabular-nums text-muted" title={plural(n.total, "proyecto", "proyectos")}>{n.total}</span>
                <span role="cell" className="px-3">
                  <Toggle on={c.active} label={`${c.name} activa`} onChange={(v) => void patch(c, { active: v }, v ? "Empresa activada" : "Empresa desactivada")} />
                </span>
                <span role="cell" className="flex justify-center">
                  <IconButton label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                    <Svg d={ICON.pencil} size={16} />
                  </IconButton>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="m-0 border-t border-line px-4 py-3 text-[13px] text-muted">
        El color y la sigla identifican a la empresa en la tabla de Proyectos y en el mural. Una empresa con proyectos sin archivar no se puede desactivar.
      </p>
      {editing && (
        <CompanyDialog
          company={editing === "new" ? null : editing}
          all={data.companies}
          onClose={() => setEditing(null)}
          onSaved={async (msg, w) => {
            setEditing(null);
            setWarnings(w);
            await done(msg);
          }}
        />
      )}
    </>
  );
}

/** Selector de color: espera a que la persona termine de elegir antes de guardar. */
function ColorCell({ company, onCommit }: { company: Company; onCommit: (color: string) => Promise<void> }) {
  const [draft, setDraft] = useState(company.color);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setDraft(company.color);
  }, [company.color]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (v: string) => {
    clearTimeout(timer.current);
    if (v.toUpperCase() !== company.color.toUpperCase()) void onCommit(v);
  };
  return (
    <>
      <label className="relative size-7 shrink-0 cursor-pointer rounded-lg shadow-[inset_0_0_0_1px_rgba(16,24,40,0.12)] focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ink" style={{ background: draft }}>
        <input
          type="color"
          aria-label={`Color de ${company.name}`}
          value={draft.toLowerCase()}
          onChange={(e) => {
            setDraft(e.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => commit(e.target.value), 700);
          }}
          onBlur={(e) => commit(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <span className="text-[13px] font-semibold uppercase tabular-nums text-ink-2">{draft}</span>
    </>
  );
}

function CompanyDialog({ company, all, onClose, onSaved }: { company: Company | null; all: Company[]; onClose: () => void; onSaved: (msg: string, warnings: string[]) => Promise<void> }) {
  const [name, setName] = useState(company?.name ?? "");
  const [code, setCode] = useState(company?.code ?? "");
  const [color, setColor] = useState(company?.color ?? "#0F766E");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clash = clashes(color, company ?? {}, all);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = company
        ? await api<{ warnings: string[] }>(`/companies/${company.id}`, { method: "PATCH", body: { version: company.version, name, code, color } })
        : await api<{ warnings: string[] }>("/companies", { method: "POST", body: { name, code, color } });
      await onSaved(company ? "Empresa guardada" : "Empresa agregada", r.warnings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <Modal title={company ? `Editar ${company.name}` : "Agregar empresa"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sigla" hint="2 letras o números, única.">
            <input className={`${inputCls} uppercase`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required pattern="[A-Za-z0-9]{2}" title="2 letras o números" maxLength={2} />
          </Field>
          <Field label="Color en el mural">
            <span className="flex items-center gap-2">
              <input type="color" aria-label="Color" value={color.toLowerCase()} onChange={(e) => setColor(e.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
              <span className="text-sm font-semibold uppercase tabular-nums">{color}</span>
            </span>
          </Field>
        </div>
        {clash.length > 0 && <Banner tone="warn">{clash.join(". ")}. Se puede guardar, pero cuesta distinguirla en el mural.</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim() || code.length !== 2}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
