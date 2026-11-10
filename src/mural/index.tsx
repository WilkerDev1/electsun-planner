import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { TZ } from "../../shared/domain";
import type { MuralView } from "../../shared/contracts/mural";
import type { RedeemResult } from "../../shared/contracts/access";
import { api } from "../ui/api";
import { useLive } from "../ui/useLive";
import { MuralScreen } from "./MuralScreen";
import { ScaledCanvas } from "./ScaledCanvas";
import { FONT, SunLogo } from "./shared";

// Mural de TV (MUR-01, MUR-10..12, ACC-03, ACC-04). `/tv/:id` con enlace de dispositivo; `/mural/tv` (preview) con una cuenta.

const redeeming = new Map<string, Promise<RedeemResult>>();

/** Canjea el token una sola vez aunque React monte el componente dos veces. */
function redeem(id: string, token: string) {
  const key = `${id}#${token}`;
  let p = redeeming.get(key);
  if (!p) {
    p = api<RedeemResult>("/access/session", { method: "POST", body: { token, id } });
    redeeming.set(key, p);
  }
  return p;
}

export default function MuralTV({ preview }: { preview?: boolean }) {
  const { id } = useParams();
  // Vista previa de una cuenta: `/mural/tv?link=<id>` muestra lo que verá esa TV (ACC-08).
  const [query] = useSearchParams();
  const previewOf = query.get("link");
  useEffect(() => {
    document.title = "Mural · Electsun";
  }, []);
  if (preview) return <LiveMural link={null} previewOf={previewOf} />;
  return <TvGate id={id ?? ""} />;
}

/** Si llega `#token`, lo canjea, borra el fragmento de la barra y solo entonces carga los datos (ACC-04). */
function TvGate({ id }: { id: string }) {
  const [token] = useState(() => window.location.hash.slice(1));
  const [state, setState] = useState<"redeeming" | "ready" | "denied">(token ? "redeeming" : "ready");
  useEffect(() => {
    if (!token) return;
    let alive = true;
    redeem(id, token).then(
      () => alive && setState("ready"),
      () => alive && setState("denied"),
    );
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return () => {
      alive = false;
    };
  }, [id, token]);
  if (state === "denied") return <Message title="Este enlace fue desactivado" detail="Pide uno nuevo en la oficina." />;
  if (state === "redeeming") return <Message title="Abriendo el mural…" />;
  return <LiveMural link={id} />;
}

/** Milisegundos hasta la próxima medianoche de la empresa (MUR-12). */
function msToMidnight(now = new Date()) {
  const [h, m, s] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .format(now)
    .split(":")
    .map(Number);
  return ((24 * 60 - (h * 60 + m)) * 60 - s) * 1000 + 500;
}

function LiveMural({ link, previewOf = null }: { link: string | null; previewOf?: string | null }) {
  const shown = link ?? previewOf;
  const live = useLive<MuralView>(
    shown ? `/view/mural?link=${encodeURIComponent(shown)}` : "/view/mural",
    link ? `mural-${link}` : previewOf ? `mural-preview-${previewOf}` : "mural-preview",
    link ? `?link=${link}` : "",
  );
  const { reload } = live;

  // A medianoche vuelve a pedir el mural, aunque no llegue ningún cambio: "hoy" y las barras se recalculan en el servidor.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        void reload();
        arm();
      }, msToMidnight());
    };
    arm();
    return () => clearTimeout(timer);
  }, [reload]);

  // Pantalla en pausa (ACC-08): la sesión se conserva, se sigue consultando y vuelve sola al reanudarla.
  if (live.revoked && live.error?.reason === "paused") {
    return <Message title="Pantalla en pausa" detail="Volverá sola cuando la reactiven en la oficina." />;
  }
  if (live.revoked) {
    return link ? (
      <Message title="Este enlace fue desactivado" detail="Pide uno nuevo en la oficina." />
    ) : (
      <Message title="Tu sesión terminó" detail={<Link to="/login" className="font-bold text-today underline">Inicia sesión de nuevo</Link>} />
    );
  }
  if (!live.data) {
    if (live.error?.status === 404) return <Message title="Este enlace no existe" detail="Revisa la lista de pantallas en Mural." />;
    return live.error ? (
      <Message title="Sin conexión" detail="No se pudo cargar el mural. Se vuelve a intentar solo." />
    ) : (
      <Message title="Cargando el mural…" />
    );
  }
  return (
    <div className="fixed inset-0 bg-canvas" style={{ cursor: link ? "none" : undefined }}>
      <ScaledCanvas className="h-full w-full">
        <MuralScreen view={live.data} live={{ fetchedAt: live.fetchedAt, offline: !!live.error }} />
      </ScaledCanvas>
    </div>
  );
}

function Message({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <main role="status" className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-canvas p-10 text-center text-ink" style={{ fontFamily: FONT }}>
      <SunLogo box={96} size={52} radius={26} />
      <h1 className="m-0 text-5xl font-extrabold tracking-tight">{title}</h1>
      {detail && <p className="m-0 text-2xl font-semibold text-subtle">{detail}</p>}
    </main>
  );
}
