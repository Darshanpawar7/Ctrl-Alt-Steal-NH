// Removes hidden details from uploaded photos: camera model, GPS location, dates,
// "made with AI" labels (EXIF, XMP, IPTC, C2PA), colour profiles and comments.
// Round 3 asks whether evidence is real or AI-made, so the file itself must not tell.
// Only the parts that draw the picture are copied; everything else is dropped.

export const CLEAN_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class UnreadableImageError extends Error {}

export function stripImageMetadata(type: string, data: Buffer): Buffer {
  if (type === "image/jpeg") return stripJpeg(data);
  if (type === "image/png") return stripPng(data);
  if (type === "image/webp") return stripWebp(data);
  throw new UnreadableImageError(`Unsupported image type ${type}.`);
}

const JFIF = Buffer.from("JFIF\0", "latin1");

/** JPEG: drops every APPn segment except JFIF (APP0) and Adobe colour info (APP14), and all comments. */
function stripJpeg(data: Buffer): Buffer {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) throw new UnreadableImageError("Not a JPEG.");
  const parts: Buffer[] = [data.subarray(0, 2)];
  let i = 2;
  while (i + 2 <= data.length) {
    if (data[i] !== 0xff) throw new UnreadableImageError("Damaged JPEG.");
    const marker = data[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd9) {
      parts.push(data.subarray(i, i + 2));
      break;
    }
    if (i + 4 > data.length) break;
    const end = i + 2 + data.readUInt16BE(i + 2);
    if (end > data.length) break;
    // Start of scan: the compressed picture runs from here to the end.
    if (marker === 0xda) {
      parts.push(data.subarray(i));
      break;
    }
    const app = marker >= 0xe0 && marker <= 0xef;
    const keep = app ? (marker === 0xe0 && data.subarray(i + 4, i + 9).equals(JFIF)) || marker === 0xee : marker !== 0xfe;
    if (keep) parts.push(data.subarray(i, end));
    i = end;
  }
  return Buffer.concat(parts);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "acTL", "fcTL", "fdAT"]);

/** PNG: keeps the chunks that draw the picture; text, EXIF, dates, profiles and C2PA go. */
function stripPng(data: Buffer): Buffer {
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new UnreadableImageError("Not a PNG.");
  const parts: Buffer[] = [data.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= data.length) {
    const end = i + 12 + data.readUInt32BE(i);
    if (end > data.length) break;
    const type = data.toString("latin1", i + 4, i + 8);
    if (PNG_KEEP.has(type)) parts.push(data.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(parts);
}

const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF"]);
/** VP8X header bits announcing an ICC profile, EXIF or XMP, which are all removed. */
const VP8X_METADATA_FLAGS = 0x20 | 0x08 | 0x04;

/** WebP: keeps the picture chunks, clears the header flags for what was removed and fixes the size. */
function stripWebp(data: Buffer): Buffer {
  if (data.length < 12 || data.toString("latin1", 0, 4) !== "RIFF" || data.toString("latin1", 8, 12) !== "WEBP") throw new UnreadableImageError("Not a WebP.");
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= data.length) {
    const fourcc = data.toString("latin1", i, i + 4);
    const size = data.readUInt32LE(i + 4);
    if (i + 8 + size > data.length) break;
    const end = Math.min(data.length, i + 8 + size + (size % 2));
    if (WEBP_KEEP.has(fourcc)) {
      const chunk = Buffer.from(data.subarray(i, end));
      if (fourcc === "VP8X" && size > 0) chunk[8] = chunk[8]! & ~VP8X_METADATA_FLAGS;
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
