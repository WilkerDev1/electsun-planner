import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../../ui/api";
import { Banner, Button, Empty, Field, Toggle } from "../../ui/components";
import { BRAND, colorDistance, fold, plural } from "../../../shared/domain";
import type { Company } from "../../../shared/contracts/equipo";
import { COMPANY_PATTERNS, PATTERN_LABELS, patternStyle, type CompanyPattern } from "../../../shared/pattern";
import { CompanyMark } from "../../ui/CompanyMark";
import { ICON, companyCounts, type TabProps } from "./model";
import { resizeLogo, uploadLogo } from "./logo";
import { IconButton, Svg, inputCls } from "./ui";
import { Modal } from "../../ui/Modal";

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
            const n = companyCounts(c, data.projects);
            const clash = clashes(c.color, c, data.companies);
            return (
              <div key={c.id} role="row" className={`${GRID} h-[60px] border-b border-line text-sm ${c.active ? "" : "bg-fill-2 opacity-70"}`}>
                <span role="cell" className="flex min-w-0 items-center gap-3 px-4">
                  <CompanyMark company={c} size={36} decorative />
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

/** Muestra del color con su patrón (EQP-08). */
function swatchStyle(color: string, pattern: string, size: number) {
  const p = patternStyle({ color, pattern }, Math.max(0.6, size / 32));
  return { backgroundColor: p.backgroundColor, backgroundImage: p.backgroundImage, backgroundSize: p.backgroundSize, backgroundPosition: p.backgroundPosition };
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
      <label className="relative size-7 shrink-0 cursor-pointer rounded-lg shadow-[inset_0_0_0_1px_rgba(16,24,40,0.12)] focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ink" style={{ ...swatchStyle(draft, company.pattern, 28) }}>
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
  const [pattern, setPattern] = useState<CompanyPattern>(company?.pattern ?? "solido");
  // El logotipo se aplica al guardar: `logo` es el nuevo ya reducido; `removeLogo`, que se quiere quitar el actual.
  const [logo, setLogo] = useState<Blob | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clash = clashes(color, company ?? {}, all);
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => void (logoPreview && URL.revokeObjectURL(logoPreview)), [logoPreview]);
  const shownLogo = logoPreview ?? (removeLogo ? null : (company?.logo_url ?? null));
  const preview = { name: name.trim() || "Empresa", code: code || "··", color, pattern, logo_url: shownLogo };

  async function pick(file: File | undefined) {
    if (!file) return;
    setLogoError("");
    try {
      setLogo(await resizeLogo(file));
      setRemoveLogo(false);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "No se pudo preparar la imagen.");
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = company
        ? await api<{ id: string; warnings: string[] }>(`/companies/${company.id}`, { method: "PATCH", body: { version: company.version, name, code, color, pattern } })
        : await api<{ id: string; warnings: string[] }>("/companies", { method: "POST", body: { name, code, color, pattern } });
      const id = r.id;
      try {
        if (logo) await uploadLogo(id, logo);
        else if (removeLogo && company?.logo_url) await api(`/companies/${id}/logo`, { method: "DELETE" });
      } catch (e) {
        // La empresa ya quedó guardada; solo el logotipo falló.
        await onSaved(company ? "Empresa guardada" : "Empresa agregada", [...r.warnings, `El logotipo no se guardó: ${e instanceof Error ? e.message : "inténtalo de nuevo."}`]);
        return;
      }
      await onSaved(company ? "Empresa guardada" : "Empresa agregada", r.warnings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <Modal title={company ? `Editar ${company.name}` : "Agregar empresa"} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} data-autofocus />
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
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 text-[12px] font-bold uppercase tracking-wide text-subtle">Patrón del color</legend>
          <div className="flex flex-wrap gap-2">
            {COMPANY_PATTERNS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={pattern === p}
                onClick={() => setPattern(p)}
                className={`flex w-[84px] flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px] font-bold text-ink-2 ${pattern === p ? "border-ink bg-fill-2 outline outline-2 outline-ink" : "border-line bg-white hover:bg-fill-2"}`}
              >
                <span aria-hidden className="block h-9 w-full rounded-lg shadow-[inset_0_0_0_1px_rgba(16,24,40,0.12)]" style={swatchStyle(color, p, 40)} />
                {PATTERN_LABELS[p]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-fill-2 p-3">
          <span className="text-[12px] font-bold uppercase tracking-wide text-subtle">Así se ve</span>
          <span
            className="flex h-10 min-w-0 flex-1 items-center rounded-lg px-3 text-sm font-extrabold"
            style={(() => {
              const p = patternStyle({ color, pattern });
              return { backgroundColor: p.backgroundColor, backgroundImage: p.backgroundImage, backgroundSize: p.backgroundSize, backgroundPosition: p.backgroundPosition, color: p.textColor };
            })()}
          >
            <span className="truncate">{name.trim() || "Nombre de la empresa"}</span>
          </span>
          <CompanyMark company={preview} size={40} decorative />
        </div>
        {clash.length > 0 && <Banner tone="warn">{clash.join(". ")}. Se puede guardar, pero cuesta distinguirla en el mural.</Banner>}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-subtle">Logotipo</span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void pick(e.dataTransfer.files[0]);
            }}
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3 ${dragging ? "border-ink bg-fill-2" : "border-line-2"}`}
          >
            {shownLogo ? (
              <img src={shownLogo} alt={`Logotipo de ${preview.name}`} className="size-14 rounded-lg border border-line bg-white object-contain" />
            ) : (
              <CompanyMark company={{ ...preview, logo_url: null }} size={56} decorative />
            )}
            <span className="flex min-w-0 flex-1 flex-col text-[13px] text-muted">
              <span>{shownLogo ? "Sustituye al monograma en el mural, la tabla y el móvil." : "Sin logotipo: se usa el monograma."}</span>
              <span>Arrastra una imagen PNG, JPG o WebP, o elige un archivo. Se reduce sola a 256 px.</span>
            </span>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Archivo del logotipo" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" onClick={() => fileInput.current?.click()}>{shownLogo ? "Cambiar logotipo" : "Subir logotipo"}</Button>
            {shownLogo && <Button type="button" variant="ghost" onClick={() => { setLogo(null); setRemoveLogo(true); }}>Quitar logotipo</Button>}
          </div>
          {logoError && <Banner tone="danger">{logoError}</Banner>}
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim() || code.length !== 2}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
