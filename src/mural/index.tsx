// Fase F2·D: mural de TV 1920×1080 (V4MuralPrincipal, V4Mural). `preview` = abierto por una cuenta desde "Ver TV".
export default function MuralTV({ preview }: { preview?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <p className="text-2xl font-bold">Mural de TV en construcción{preview ? " (vista de la oficina)" : ""}</p>
    </main>
  );
}
