import { useEffect, useRef, useState, type ReactNode } from "react";
import { Banner, Button } from "../../ui/components";
import { Modal } from "./Modal";

/** URL absoluta de una ruta de la app (`/tv/…#token`), tal como se comparte. */
export const absoluteUrl = (path: string) => window.location.origin + path;

export type LinkSecretDialogProps = {
  /** Título del diálogo, por ejemplo "Enlace móvil de Luis Peña". */
  title: string;
  /** Ruta secreta con su fragmento: `/activar#…`, `/tv/:id#…` o `/m/activar#id.token`. Solo se tiene una vez. */
  path: string;
  /** Qué hace el enlace y cómo usarlo. */
  intro?: ReactNode;
  /** Caducidad o advertencia propia del enlace ("Vence en 48 horas…"). */
  note?: ReactNode;
  /** Se llama al cerrar el diálogo; después el secreto ya no se puede volver a ver. */
  onClose: () => void;
};

/**
 * Muestra una ruta secreta una sola vez (ACC-07, AUT-03, AUT-04): URL completa, botón Copiar y código QR
 * generado en el navegador. Las fases de TV y móvil lo reutilizan: `<LinkSecretDialog title path note onClose />`.
 */
export function LinkSecretDialog({ title, path, intro, note, onClose }: LinkSecretDialogProps) {
  const url = absoluteUrl(path);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [qr, setQr] = useState<{ state: "loading" } | { state: "ready"; src: string } | { state: "error" }>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    setQr({ state: "loading" });
    import("qrcode")
      .then((m) => ((m as unknown as { default?: typeof m }).default ?? m).toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1f27", light: "#ffffff" } }))
      .then((src) => alive && setQr({ state: "ready", src }))
      .catch(() => alive && setQr({ state: "error" }));
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (copied === "idle") return;
    const t = setTimeout(() => setCopied("idle"), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      input.current?.select();
      setCopied(document.execCommand("copy") ? "ok" : "fail");
    }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      {intro && <p className="m-0 mb-4 text-[15px] leading-relaxed text-ink-2">{intro}</p>}
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          value={url}
          aria-label="Enlace"
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-fill-2 px-3 text-sm text-ink-2"
        />
        <Button type="button" onClick={copy} className="shrink-0">
          {copied === "ok" ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p role="status" className="m-0 mt-1.5 min-h-5 text-[13px] font-semibold text-ok">
        {copied === "ok" && "Enlace copiado al portapapeles."}
        {copied === "fail" && <span className="text-danger">No se pudo copiar. Selecciona el enlace y cópialo a mano.</span>}
      </p>

      <div className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-line bg-fill-2 p-4">
        <div className="flex size-[200px] items-center justify-center rounded-xl bg-white">
          {qr.state === "ready" && <img src={qr.src} alt="Código QR del enlace" width={192} height={192} />}
          {qr.state === "loading" && <span className="text-sm text-subtle">Generando código QR…</span>}
          {qr.state === "error" && <span className="px-4 text-center text-sm text-danger">No se pudo generar el código QR. Usa el enlace.</span>}
        </div>
        <p className="m-0 text-[13px] text-subtle">También se puede escanear con la cámara del teléfono.</p>
      </div>

      <div className="mt-4">
        <Banner tone="warn">
          Este enlace se muestra una sola vez; si lo pierdes, genera otro. Quien lo tenga puede entrar, así que compártelo solo con quien corresponde.
          {note && <span className="mt-1 block">{note}</span>}
        </Banner>
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="button" variant="primary" onClick={onClose}>
          Listo
        </Button>
      </div>
    </Modal>
  );
}
