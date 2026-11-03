import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../ui/api";
import type { RedeemResult } from "../../shared/contracts/access";
import { Sun } from "./ui";

// /m/activar#<id>.<token>: canjea el enlace personal y abre /m (ACC-04).
export default function Activar() {
  const navigate = useNavigate();
  const [token] = useState(() => window.location.hash.replace(/^#/, ""));
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (started.current) return;
    started.current = true;
    if (token.length < 20) return setFailed(true);
    api<RedeemResult>("/access/session", { body: { token } })
      .then(() => {
        try {
          localStorage.removeItem("movil");
        } catch {
          /* sin almacenamiento */
        }
        navigate("/m", { replace: true });
      })
      .catch(() => setFailed(true));
  }, [token, navigate]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <Sun size={48} />
      {failed ? (
        <>
          <h1 className="m-0 text-[22px] font-extrabold">Este enlace no funciona</h1>
          <p className="m-0 max-w-[320px] text-[16px] leading-relaxed text-muted">Pide uno nuevo en la oficina.</p>
        </>
      ) : (
        <p role="status" className="m-0 text-[17px] font-bold text-muted">
          Activando tu acceso…
        </p>
      )}
    </main>
  );
}
