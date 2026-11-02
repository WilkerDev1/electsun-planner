import type { JSX } from "react";
import type { Employee } from "../../../shared/contracts/equipo";

// Versión provisional de la fase C solo para compilar: en la integración se queda la de la fase A (ACC-07).
const LABEL: Record<Employee["mobile_access"], { text: string; cls: string }> = {
  none: { text: "Sin enlace", cls: "bg-fill text-muted" },
  active: { text: "Activo", cls: "bg-[#E0F4EF] text-[#095C4F]" },
  revoked: { text: "Revocado", cls: "bg-warn-soft text-warn" },
};

export function MobileAccessCell(props: { employee: Employee; onChanged: () => void }): JSX.Element {
  const s = LABEL[props.employee.mobile_access];
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ${s.cls}`}>{s.text}</span>;
}
