import { Sun } from "./ui";

// Enlace revocado o empleado que ya no está activo (ACC-03): 401/403 de /api/view/movil.
export default function Desactivado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <Sun size={48} />
      <h1 className="m-0 text-[22px] font-extrabold">Este enlace fue desactivado</h1>
      <p className="m-0 max-w-[320px] text-[16px] leading-relaxed text-muted">Pide uno nuevo en la oficina.</p>
    </main>
  );
}
