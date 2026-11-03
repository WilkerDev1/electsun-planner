import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { MovilContact } from "../../shared/contracts/movil";
import { CallButton, CompanyMono, Icon, ICON, MapsButton, PersonRow, Panel, Segments, type FromTab, useMovil } from "./ui";

// Detalle de una obra (MOV-05): estado, cronograma, datos, responsables y equipo asignado.

const BACK: Record<FromTab, string> = { Hoy: "/m", Obras: "/m/obras", Calendario: "/m/calendario" };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#F0F1F4] px-4 py-3">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="text-right text-[16px] font-bold">{children}</span>
    </div>
  );
}

function Responsible({ role, contact }: { role: string; contact: MovilContact }) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="text-[14px] text-muted">{role}</span>
        <span className="text-[16px] font-bold">{contact.name}</span>
      </span>
      {contact.phone && <CallButton phone={contact.phone} name={contact.name} />}
    </div>
  );
}

export default function Detalle() {
  const { id } = useParams();
  const { view } = useMovil();
  const navigate = useNavigate();
  const { state } = useLocation();
  const from = (state as { from?: FromTab } | null)?.from;
  const job = id ? view.detail[id] : undefined;
  const back = () => (from ? navigate(-1) : navigate(BACK.Obras));
  const backLabel = from ?? "Obras";

  const backButton = (
    <div className="flex items-center px-3 pt-3.5">
      <button type="button" onClick={back} className="flex min-h-11 items-center gap-1 border-0 bg-transparent pl-1 pr-3 text-[16px] font-bold text-ink-2">
        <Icon d={ICON.chevronLeft} size={20} width={2.2} />
        {backLabel}
      </button>
    </div>
  );

  if (!job)
    return (
      <div className="flex flex-col">
        {backButton}
        <div className="flex flex-col gap-3 px-4 pt-6">
          <h1 className="m-0 text-[22px] font-extrabold">Esta obra ya no está en tu lista</h1>
          <p className="m-0 text-[16px] leading-relaxed text-muted">Pudo terminar o cambiar de fecha. Mira las obras activas y próximas.</p>
          <Link to="/m/obras" replace className="flex min-h-12 items-center justify-center rounded-xl bg-ink text-[16px] font-bold text-white no-underline">
            Ver obras
          </Link>
        </div>
      </div>
    );

  const late = job.late_days > 0;
  const live = job.kind === "en_obra";
  const lead = job.lead;
  const supervisor = job.supervisor;

  return (
    <div className="flex flex-col">
      {backButton}
      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-1.5">
        <header className="flex items-start gap-3">
          <CompanyMono company={job.company} size={52} round={false} decorative />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="m-0 text-[26px] font-extrabold leading-tight tracking-tight">{job.name}</h1>
            <div className="flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[14px] font-bold ${live ? "bg-ok-soft text-ok" : "bg-[#EEF2FF] text-[#3B4FC4]"}`}
              >
                <span aria-hidden className={`size-[7px] rounded-full bg-current ${live ? "movil-pulse" : ""}`} />
                {job.status_label}
              </span>
              {late && <span className="rounded-lg bg-warn-soft px-2.5 py-1 text-[14px] font-bold text-warn">Atrasada</span>}
              {job.priority && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-fill px-2.5 py-1 text-[14px] font-bold text-navy">
                  <Icon d={ICON.flag} size={14} width={2.4} />
                  Prioridad
                </span>
              )}
              {job.part && <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-[14px] font-bold text-brand-ink">{job.part}</span>}
            </div>
          </div>
        </header>

        {job.notes.trim() && (
          <div className="flex gap-2.5 rounded-2xl border border-[#F6D9C4] bg-[#FFF6EF] px-3.5 py-3">
            <Icon d={ICON.warn} size={20} width={2.2} className="mt-0.5 text-today" />
            <p className="m-0 text-[16px] font-semibold leading-snug">{job.notes}</p>
          </div>
        )}

        <Panel label="Cronograma" className="flex flex-col gap-2.5 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="m-0 text-[17px] font-extrabold">Cronograma</h2>
            <span className={`text-[15px] font-bold ${late ? "text-warn" : live ? "text-ok" : "text-[#3B4FC4]"}`}>{job.when_text}</span>
          </div>
          <Segments segments={job.segments} kind={job.kind} height={10} />
          <div className="flex justify-between gap-3 text-[14px] text-muted">
            <span>
              Inicio · <strong className="text-ink">{job.start_text}</strong>
            </span>
            <span>
              Fin · <strong className="text-ink">{job.end_text_long}</strong>
            </span>
          </div>
          {late && <p className="m-0 text-[14px] font-semibold text-warn">Debía terminar el {job.end_text_long.toLowerCase()}.</p>}
          <p className="m-0 text-[13px] text-muted">Cada bloque es un día de trabajo (lunes a sábado).</p>
        </Panel>

        <Panel label="Datos de la obra" className="overflow-hidden">
          <Fact label="Empresa">{job.company.name}</Fact>
          <Fact label="Lugar">{job.place || "Por confirmar"}</Fact>
          {job.kwp && <Fact label="Potencia">{job.kwp} kWp</Fact>}
          <Fact label="Fechas">{job.dates_text}</Fact>
          <Fact label="Días de trabajo">{job.duration_text}</Fact>
          <Fact label="Preparación">
            {job.prep.length === 0 ? <span className="text-muted">No lleva</span> : <span className={job.prep_ready ? "text-ok" : "text-warn"}>{job.prep_text}</span>}
          </Fact>
          {job.prep.length > 0 && (
            <ul aria-label="Detalle de la preparación" className="m-0 flex list-none flex-col gap-0 border-b border-[#F0F1F4] p-0">
              {job.prep.map((it) => (
                <li key={it.code} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                  <span className={`text-[15px] ${it.applies ? "" : "text-muted"}`}>{it.name}</span>
                  <span className={`shrink-0 text-[14px] font-bold ${!it.applies ? "text-muted" : it.done ? "text-ok" : "text-warn"}`}>
                    {!it.applies ? "No aplica" : it.done ? "Hecho" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {job.map_url && (
            <div className="p-3">
              <MapsButton url={job.map_url} className="min-h-12 w-full">
                Cómo llegar a {job.place}
              </MapsButton>
            </div>
          )}
        </Panel>

        {(lead || supervisor) && (
          <Panel label="Responsables" className="flex flex-col gap-2.5 px-4 py-3.5">
            <h2 className="m-0 text-[17px] font-extrabold">Responsables</h2>
            {lead && <Responsible role="Encargado" contact={lead} />}
            {supervisor && <Responsible role="Supervisor" contact={supervisor} />}
          </Panel>
        )}

        {job.team && (
          <Panel label="Equipo asignado" className="flex flex-col gap-2.5 px-4 py-3.5">
            <h2 className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-extrabold">
              Equipo asignado
              <span className="rounded-md bg-fill px-2 py-0.5 text-[13px] font-extrabold text-muted">
                {job.team.code} · {job.team.name}
              </span>
            </h2>
            {job.team.members.map((m) => (
              <PersonRow key={m.id} person={m.name === lead?.name ? { ...m, phone: null } : m} />
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
