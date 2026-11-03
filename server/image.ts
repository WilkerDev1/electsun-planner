// Reconocimiento de imágenes por sus bytes (EQP-07). Sin librerías: se lee la firma y el tamaño de la cabecera.
// No se confía en la extensión ni en el Content-Type, y no se admite SVG (puede llevar scripts).

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export type ImageInfo = { mime: ImageMime; width: number; height: number };

const u16be = (b: Buffer, o: number) => b.readUInt16BE(o);

function png(b: Buffer): ImageInfo | null {
  // Firma de 8 bytes, y el primer bloque debe ser IHDR (ancho y alto de 4 bytes cada uno).
  if (b.length < 24 || !b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  if (b.toString("latin1", 12, 16) !== "IHDR") return null;
  return { mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let o = 2;
  // Recorre los segmentos hasta el primer SOFn, que trae el tamaño.
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1];
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // fin o datos de imagen sin haber visto el tamaño
    const length = u16be(b, o + 2);
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (o + 9 > b.length) return null;
      return { mime: "image/jpeg", height: u16be(b, o + 5), width: u16be(b, o + 7) };
    }
    o += 2 + length;
  }
  return null;
}

function webp(b: Buffer): ImageInfo | null {
  if (b.length < 30 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X") {
    // Ancho y alto menos 1, en 3 bytes little endian.
    return { mime: "image/webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    // Fotograma clave: código de inicio 9D 01 2A y después ancho y alto de 14 bits.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { mime: "image/webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { mime: "image/webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  return null;
}

/** Tipo y tamaño de una imagen PNG, JPEG o WebP; `null` si los bytes no son ninguna de las tres. */
export function sniffImage(buffer: Buffer): ImageInfo | null {
  return png(buffer) ?? jpeg(buffer) ?? webp(buffer);
}
