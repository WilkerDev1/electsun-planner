import { Sun } from "./ui";

// 401 o 403 en la vista: el enlace se revocó, rotó o el empleado ya no está activo (ACC-03, ACC-06).
export default function Desactivado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Sun size={56} />
      <h1 className="m-0 text-[24px] font-extrabold">Este enlace fue desactivado</h1>
      <p className="m-0 max-w-[320px] text-[17px] leading-relaxed text-muted">Pide uno nuevo en la oficina para volver a ver tus obras.</p>
    </main>
  );
}
