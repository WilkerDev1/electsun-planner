import { Link } from "react-router-dom";
import { weekdayShort } from "../../shared/domain";
import { CallButton, CompanyMono, Icon, ICON, MapsButton, Panel, PersonRow, SectionTitle, Segments, TeamBadge, fromState, hhmm, jobLink, useMovil } from "./ui";

// Hoy (MOV-02): saludo, la obra de mi equipo, el equipo, la semana, lo próximo y los avisos.
const WEEK_BAR = { obra: "#16A34A", programado: "#4F63D8", libre: "#D0D5DD" } as const;

export default function Hoy() {
  const { view, fetchedAt, offline } = useMovil();
  const { me, team, hoy } = view;
  const job = hoy.current;
  const late = !!job && job.late_days > 0;
  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white" aria-hidden>
            <Icon d="M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" size={22} width={2.1} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[14px] font-semibold text-muted">{view.date_text}</span>
            <h1 className="m-0 text-[24px] font-extrabold tracking-tight">Hola, {me.first_name}</h1>
          </div>
        </div>
        <span role="img" aria-label={me.name} className="flex size-10 items-center justify-center rounded-full bg-fill text-[14px] font-extrabold text-ink-2">
          {me.initials}
        </span>
      </header>

      <Panel label="Tu equipo hoy" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#F0F1F4] px-4 py-3.5">
          <span className="flex items-center gap-2 text-[15px] font-bold text-muted">
            {me.team_code && <TeamBadge code={me.team_code} />}Tu equipo hoy
          </span>
          {job && (
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[14px] font-bold ${job.kind === "en_obra" ? "bg-ok-soft text-ok" : "bg-[#EEF2FF] text-[#3B4FC4]"}`}>
              <span className={`size-[7px] rounded-full ${job.kind === "en_obra" ? "movil-pulse bg-ok" : "bg-[#3B4FC4]"}`} />
              {job.status_label}
            </span>
          )}
        </div>
        {job ? (
          <div className="flex flex-col gap-3.5 p-4">
            <div className="flex items-start gap-3">
              <CompanyMono company={job.company} size={44} round={false} decorative />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-[22px] font-extrabold leading-tight tracking-tight">{job.name}</span>
                  {job.priority && (
                    <span role="img" aria-label="Prioridad" className="text-navy">
                      <Icon d={ICON.flag} size={18} width={2.4} />
                    </span>
                  )}
                </span>
                <span className="text-[15px] text-muted">
                  {job.company.name}
                  {job.kwp && ` · ${job.kwp} kWp`}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[18px] font-extrabold ${late ? "text-warn" : job.kind === "en_obra" ? "text-ok" : "text-[#3B4FC4]"}`}>{job.when_text}</span>
                <span className="text-[15px] font-semibold text-muted">{job.end_text}</span>
              </div>
              <Segments segments={job.segments} kind={job.kind} />
            </div>
            <div className="flex items-center gap-2.5 rounded-[14px] bg-fill-2 p-3">
              <Icon d={ICON.pin} size={20} className="text-muted" />
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="text-[16px] font-bold">{job.place || "Lugar por confirmar"}</span>
                {job.lead && <span className="text-[14px] text-muted">Encargado: {job.lead.name}</span>}
              </span>
              {job.lead?.phone && <CallButton phone={job.lead.phone} name={job.lead.name} />}
            </div>
            {job.map_url && <MapsButton url={job.map_url}>Cómo llegar</MapsButton>}
            <Link
              to={jobLink(job.id)}
              state={fromState("Hoy")}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-[16px] font-bold text-ink-2 no-underline"
            >
              Ver detalles de la obra
              <Icon d={ICON.chevronRight} size={16} width={2.2} />
            </Link>
          </div>
        ) : (
          <p className="m-0 p-4 text-[16px] text-muted">
            {team ? "Tu equipo no tiene obra hoy." : "Todavía no tienes equipo asignado. Pregunta en la oficina."}
          </p>
        )}
      </Panel>

      {team && (
        <Panel label="Tu equipo" className="flex flex-col gap-2.5 px-4 py-3.5">
          <h2 className="m-0 text-[17px] font-extrabold">{team.name}</h2>
          {team.members.map((m) => (
            <PersonRow key={m.id} person={m} />
          ))}
        </Panel>
      )}

      {team && (
        <Panel label="Tu semana" className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[17px] font-extrabold">Tu semana</h2>
            <Link to="/m/calendario" state={{ team: team.code }} className="flex min-h-11 items-center px-1 text-[15px] font-bold text-today no-underline">
              Ver calendario
            </Link>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {hoy.week.map((d) => (
              <div
                key={d.date}
                aria-label={`${d.dow} ${d.day}: ${d.state === "libre" ? "sin obra" : d.state === "obra" ? "en obra" : "programado"}`}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-2 ${d.is_today ? "border-[#F6C9A8] bg-[#FFF6EF]" : "border-[#F0F1F4] bg-fill-2"}`}
              >
                <span className={`text-[13px] font-bold ${d.is_today ? "text-today" : "text-muted"}`}>{d.dow.slice(0, 1)}</span>
                <span className={`text-[18px] font-extrabold ${d.is_today ? "text-today" : "text-ink"}`}>{d.day}</span>
                <span className="h-[5px] w-[22px] rounded-[3px]" style={{ background: WEEK_BAR[d.state] }} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-[13px] font-semibold text-muted">
            {(["obra", "programado", "libre"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-[5px] w-3.5 rounded-[3px]" style={{ background: WEEK_BAR[k] }} />
                {k === "obra" ? "En obra" : k === "programado" ? "Programado" : "Sin obra"}
              </span>
            ))}
          </div>
        </Panel>
      )}

      {hoy.next.length > 0 && (
        <section aria-label="Lo próximo" className="flex flex-col gap-2.5">
          <SectionTitle>Lo próximo para tu equipo</SectionTitle>
          {hoy.next.map((n) => (
            <Link key={n.id} to={jobLink(n.id)} state={fromState("Hoy")} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-3 text-ink no-underline">
              <span className="flex w-[54px] shrink-0 flex-col items-center rounded-xl bg-[#EEF2FF] py-1.5 leading-tight text-[#3B4FC4]">
                <span className="text-[13px] font-extrabold">{weekdayShort(n.start_date).toUpperCase()}</span>
                <span className="text-[21px] font-extrabold">{Number(n.start_date.slice(8, 10))}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[17px] font-bold">{n.name}</span>
                <span className="text-[14px] text-muted">
                  {n.place} · {n.duration_text}
                </span>
                <span className="text-[14px] font-bold text-[#3B4FC4]">{n.when_text}</span>
              </span>
              <Icon d={ICON.chevronRight} size={16} width={2.2} className="text-faint" />
            </Link>
          ))}
        </section>
      )}

      {hoy.notices.length > 0 && (
        <section aria-label="Avisos" className="flex flex-col gap-2.5">
          <SectionTitle>Avisos</SectionTitle>
          {hoy.notices.map((a, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border border-line bg-white px-3.5 py-3">
              <span className="mt-[7px] size-2 shrink-0 rounded-full bg-brand" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-bold text-brand-ink">{a.title}</span>
                <span className="text-[16px] font-semibold leading-snug">{a.text}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      <p className="m-0 flex items-center justify-center gap-1.5 text-[13px] text-muted">
        <span className={`size-1.5 rounded-full ${offline ? "bg-warn-line" : "bg-[#16A34A]"}`} />
        {fetchedAt ? `Actualizado ${hhmm(fetchedAt)}` : "Actualizado"} · solo lectura
      </p>
    </div>
  );
}
