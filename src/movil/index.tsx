import { useEffect } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import type { MovilView } from "../../shared/contracts/movil";
import { useLive } from "../ui/useLive";
import "./movil.css";
import Activar from "./Activar";
import Calendario from "./Calendario";
import Desactivado from "./Desactivado";
import Detalle from "./Detalle";
import Hoy from "./Hoy";
import Obras from "./Obras";
import { Icon, ICON, Sun, hhmm, type FromTab, type MovilCtx } from "./ui";

// Fase F2·E: PWA para técnicos en /m (V4Movil, MOV-01..09). Sin cuenta: entra con el enlace personal (ACC-04).

const CACHE_KEY = "movil";
let swRegistered = false;

/** Solo esta parte de la aplicación registra el service worker (MOV-01, MOV-07). */
function registerWorker() {
  if (swRegistered || !("serviceWorker" in navigator)) return;
  swRegistered = true;
  registerSW({ immediate: true });
}

/** La caché de una versión anterior puede no tener la forma actual; en ese caso se ignora. */
const isView = (v: unknown): v is MovilView => {
  const x = v as Partial<MovilView> | null;
  return !!x && typeof x === "object" && !!x.me && !!x.hoy && !!x.obras && !!x.calendario && !!x.detail;
};

const TABS = [
  { label: "Hoy", to: "/m", icon: ICON.home },
  { label: "Obras", to: "/m/obras", icon: ICON.table },
  { label: "Calendario", to: "/m/calendario", icon: ICON.calendar },
] as const;

function Nav() {
  const { pathname, state } = useLocation();
  const from = (state as { from?: FromTab } | null)?.from;
  const path = pathname.replace(/\/$/, "") || "/";
  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white">
      <div className="mx-auto grid max-w-[480px] grid-cols-3 gap-1.5 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map((t) => {
          const on = path === t.to || (path.startsWith("/m/obra/") && from === t.label);
          return (
            <Link
              key={t.to}
              to={t.to}
              replace
              aria-current={on ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl no-underline ${on ? "bg-brand-soft text-today" : "text-muted"}`}
            >
              <Icon d={t.icon} size={24} />
              <span className="text-[13px] font-bold">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Message({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <Sun size={48} />
      <h1 className="m-0 text-[22px] font-extrabold">{title}</h1>
      <p className="m-0 max-w-[320px] text-[16px] leading-relaxed text-muted">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-2 h-12 rounded-xl bg-ink px-6 text-[16px] font-bold text-white">
          {action.label}
        </button>
      )}
    </main>
  );
}

/** Carga la vista (SSE, 60 s y primer plano: MOV-09), la guarda para trabajar sin conexión (MOV-07) y pone la barra inferior (MOV-06). */
function Shell() {
  const live = useLive<MovilView>("/view/movil", CACHE_KEY, "");

  useEffect(() => {
    if (!live.revoked) return;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* sin almacenamiento */
    }
  }, [live.revoked]);

  if (live.revoked) return <Desactivado />;
  if (!isView(live.data))
    return live.error ? (
      <Message
        title="Sin conexión"
        text="Todavía no hay datos guardados en este teléfono. Conéctate a internet para ver tus obras."
        action={{ label: "Reintentar", onClick: () => void live.reload() }}
      />
    ) : (
      <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <p className="m-0 text-[16px] font-bold text-muted">Cargando tus obras…</p>
      </main>
    );

  const ctx: MovilCtx = { view: live.data, fetchedAt: live.fetchedAt, offline: live.offline && !!live.error };
  return (
    <div className="movil-root mx-auto min-h-dvh w-full max-w-[480px]">
      {ctx.offline && live.fetchedAt && (
        <div role="status" className="sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-warn-line bg-warn-soft px-4 py-2.5 text-[14px] font-bold text-warn">
          <Icon d={ICON.wifiOff} size={18} />
          Sin conexión · datos de las {hhmm(live.fetchedAt)}
        </div>
      )}
      <main className="pb-[calc(96px+env(safe-area-inset-bottom))]">
        <Outlet context={ctx} />
      </main>
      <Nav />
    </div>
  );
}

export default function Movil() {
  useEffect(() => {
    registerWorker();
    const previous = document.title;
    document.title = "Electsun Obras";
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <Routes>
      <Route path="activar" element={<Activar />} />
      <Route element={<Shell />}>
        <Route index element={<Hoy />} />
        <Route path="obras" element={<Obras />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="obra/:id" element={<Detalle />} />
      </Route>
      <Route path="*" element={<Navigate to="/m" replace />} />
    </Routes>
  );
}
