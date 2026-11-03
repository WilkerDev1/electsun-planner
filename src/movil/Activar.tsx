import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RedeemResult } from "../../shared/contracts/access";
import { api } from "../ui/api";
import { Sun } from "./ui";

// /m/activar#<id>.<token>: canjea el enlace personal por la cookie del teléfono (ACC-04) y entra a /m.
export default function Activar() {
  const navigate = useNavigate();
  // El token se lee del fragmento al montar y se borra de la barra de direcciones (no queda en el historial).
  const [token] = useState(() => window.location.hash.replace(/^#/, ""));
  const [failed, setFailed] = useState(token.length < 20);
  const started = useRef(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (started.current || token.length < 20) return;
    started.current = true;
    api<RedeemResult>("/access/session", { body: { token } })
      .then((r) => {
        try {
          // Otro empleado pudo usar antes este teléfono: se descartan sus datos guardados.
          localStorage.removeItem("movil");
        } catch {
          /* sin almacenamiento */
        }
        navigate(r.kind === "mobile" ? "/m" : r.redirect, { replace: true });
      })
      .catch(() => setFailed(true));
  }, [navigate, token]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Sun size={56} />
      {failed ? (
        <>
          <h1 className="m-0 text-[24px] font-extrabold">Este enlace no funciona</h1>
          <p className="m-0 max-w-[320px] text-[17px] leading-relaxed text-muted">Pide uno nuevo en la oficina.</p>
        </>
      ) : (
        <>
          <h1 className="m-0 text-[24px] font-extrabold">Activando tu enlace…</h1>
          <p className="m-0 text-[16px] text-muted" role="status">
            Un momento.
          </p>
        </>
      )}
    </main>
  );
}
