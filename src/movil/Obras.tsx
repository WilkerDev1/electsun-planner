import { useState } from "react";
import { Link } from "react-router-dom";
import type { MovilJob } from "../../shared/contracts/movil";
import { plural } from "../../shared/domain";
import { CompanyMono, Icon, ICON, MineChip, PageTitle, Switch, TeamBadge, fromState, jobLink, useMovil } from "./ui";

// Obras (MOV-03): en obra y próximas de todos los equipos, con "Tu equipo" y filtro "Mi equipo".
function Row({ job }: { job: MovilJob }) {
  const late = job.late_days > 0;
  return (
    <Link
      to={jobLink(job.id)}
      state={fromState("Obras")}
      className={`flex w-full items-center gap-3 border-b border-[#F0F1F4] px-3.5 py-3 text-ink no-underline last:border-b-0 ${job.mine ? "bg-[#FFFCF9]" : "bg-white"}`}
    >
      <CompanyMono company={job.company} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[16px] font-bold">{job.name}</span>
          {job.mine && <MineChip />}
        </span>
        <span className="truncate text-[14px] text-muted">
          {job.place} · {job.dates_text}
        </span>
        {job.kind === "en_obra" ? (
          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-line">
              <span className="block h-1.5 rounded-[3px]" style={{ width: `${Math.round(job.progress * 100)}%`, background: late ? "#F59E0B" : "#16A34A" }} />
            </span>
            <span className={`whitespace-nowrap text-[13px] font-bold ${late ? "text-warn" : "text-ok"}`}>{job.when_text}</span>
          </span>
        ) : (
          <span className="text-[14px] font-bold text-[#3B4FC4]">{job.when_text}</span>
        )}
      </span>
      {job.team_code && <TeamBadge code={job.team_code} />}
    </Link>
  );
}

export default function Obras() {
  const { view } = useMovil();
  const [scope, setScope] = useState<"todos" | "mio">("todos");
  const { obras } = view;
  const pick = (rows: MovilJob[]) => (scope === "mio" ? rows.filter((r) => r.mine) : rows);
  const groups = [
    { label: "EN OBRA", dot: "#16A34A", fg: "text-ok", rows: pick(obras.en_obra) },
    { label: "PRÓXIMOS", dot: "#4F63D8", fg: "text-[#3B4FC4]", rows: pick(obras.proximas) },
  ].filter((g) => g.rows.length);
  return (
    <div className="flex flex-col gap-3.5 px-4 pb-6 pt-5">
      <PageTitle title="Obras" subtitle={`${obras.en_obra.length} en obra · ${obras.proximas.length} programadas`} />
      <Switch
        label="Filtrar obras"
        value={scope}
        onChange={setScope}
        options={[
          { value: "todos", label: "Todas" },
          { value: "mio", label: "Mi equipo" },
        ]}
      />
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
          <h2 className={`m-0 flex items-center gap-2 px-1 pt-1.5 text-[14px] font-extrabold tracking-[0.08em] ${g.fg}`}>
            <span className="size-2.5 rounded-[3px]" style={{ background: g.dot }} />
            {g.label}
            <span className="tracking-normal">{g.rows.length}</span>
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-line bg-white">
            {g.rows.map((r) => (
              <Row key={r.id} job={r} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="m-0 rounded-2xl border border-dashed border-line-2 bg-white p-4 text-[16px] text-muted">No hay obras en curso ni programadas.</p>}
      {obras.por_programar + obras.en_pausa > 0 && (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-dashed border-line-2 bg-white px-3.5 py-3 text-[15px] text-muted">
          <Icon d={ICON.clock} size={18} />
          <span>
            <strong className="text-ink">{plural(obras.por_programar, "por programar", "por programar")}</strong>
            {obras.en_pausa > 0 && ` y ${obras.en_pausa} en pausa`} esperan fecha.
          </span>
        </div>
      )}
    </div>
  );
}
