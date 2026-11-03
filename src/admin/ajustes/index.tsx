import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../ui/auth";
import { Banner, PageHeader, useFlash } from "../../ui/components";
import { StatusesCard } from "../mural/Statuses";
import { PrepCatalogCard } from "./Prep";

// Ajustes (EST-05, PRY-12): estados y catálogo de preparación. La oficina los ve en solo lectura.
export default function Ajustes() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { flash, node } = useFlash(3000);
  const { hash } = useLocation();

  // Las anclas (#estados, #preparacion) llevan a su sección aunque la página cargue después.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Los estados de los proyectos y los parámetros de preparación." />
      {!isAdmin && (
        <div className="mb-4">
          <Banner tone="info">Solo la administración puede cambiar los ajustes. Tú puedes verlos.</Banner>
        </div>
      )}
      <nav aria-label="Secciones de ajustes" className="mb-4 flex gap-2 text-sm font-bold">
        <a href="#estados" className="rounded-lg border border-line bg-white px-3 py-1.5 text-ink-2 no-underline hover:bg-fill-2">Estados</a>
        <a href="#preparacion" className="rounded-lg border border-line bg-white px-3 py-1.5 text-ink-2 no-underline hover:bg-fill-2">Preparación</a>
      </nav>
      <div className="flex max-w-[960px] flex-col gap-5">
        <div id="estados" className="scroll-mt-4">
          <StatusesCard canEdit={isAdmin} flash={flash} />
        </div>
        <div id="preparacion" className="scroll-mt-4">
          <PrepCatalogCard canEdit={isAdmin} flash={flash} />
        </div>
      </div>
      {node}
    </>
  );
}
