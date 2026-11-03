// Logotipo de empresa (EQP-07): se reduce en el navegador a 256 px de lado como máximo, con la misma proporción y la
// transparencia, antes de enviarlo. El servidor admite hasta 300 KB.

export const LOGO_MAX_SIDE = 256;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 300 * 1024;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Devuelve la imagen reducida (PNG; WebP si el PNG pesara demasiado). Lanza un Error con un texto para la persona. */
export async function resizeLogo(file: File): Promise<Blob> {
  if (!LOGO_TYPES.includes(file.type)) throw new Error("Elige una imagen PNG, JPG o WebP.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la imagen. Prueba con otro archivo.");
  }
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede preparar la imagen.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let out = await toBlob(canvas, "image/png");
  if (out && out.size > MAX_BYTES) out = await toBlob(canvas, "image/webp", 0.9);
  if (!out) throw new Error("No se pudo preparar la imagen.");
  if (out.size > MAX_BYTES) throw new Error("La imagen sigue pesando demasiado. Usa una más sencilla.");
  return out;
}

/** Envía el logotipo ya reducido. El servidor lee los bytes, no el tipo declarado. */
export async function uploadLogo(companyId: string, blob: Blob): Promise<void> {
  const r = await fetch(`/api/companies/${companyId}/logo`, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
    credentials: "same-origin",
  });
  if (r.ok) return;
  let text = "No se pudo subir el logotipo. Intenta de nuevo.";
  try {
    const data = (await r.json()) as { message?: string };
    if (data.message) text = data.message;
  } catch {
    // Respuesta sin cuerpo JSON: se queda el texto general.
  }
  throw new Error(text);
}
