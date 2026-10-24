import { describe, expect, test } from "vitest";
import { stripImageMetadata } from "../src/server/images";

const latin = (text: string) => Buffer.from(text, "latin1");
const has = (data: Buffer, text: string) => data.includes(latin(text));
const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

/** Hidden details a real photo or an AI image might carry. */
const SECRETS = ["Exif", "Canon EOS", "xap/1.0", "trainedAlgorithmicMedia", "ICC_PROFILE", "c2pa", "8BIM", "made with midjourney"];

function jpegSegment(marker: number, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xff, marker]), u16(payload.length + 2), payload]);
}

function jpegWithMetadata(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, latin("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xe1, latin("Exif\0\0MM\0*Canon EOS R5 GPS 12.97N 77.59E")),
    jpegSegment(0xe1, latin("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>DigitalSourceType trainedAlgorithmicMedia</x:xmpmeta>")),
    jpegSegment(0xe2, latin("ICC_PROFILE\0\x01\x01Display P3")),
    jpegSegment(0xeb, latin("JP\0\0c2pa manifest")),
    jpegSegment(0xed, latin("Photoshop 3.0\x008BIM iptc")),
    jpegSegment(0xee, latin("Adobe\0d\0\0\0\0\x01")),
    jpegSegment(0xfe, latin("made with midjourney")),
    jpegSegment(0xdb, Buffer.alloc(65, 7)),
    jpegSegment(0xc0, Buffer.from([8, 0, 16, 0, 16, 1, 1, 0x11, 0])),
    jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  return Buffer.concat([u32(data.length), latin(type), data, Buffer.alloc(4)]);
}
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function webpChunk(fourcc: string, data: Buffer): Buffer {
  return Buffer.concat([latin(fourcc), u32le(data.length), data, Buffer.alloc(data.length % 2)]);
}
function riff(chunks: Buffer[]): Buffer {
  const body = Buffer.concat([latin("WEBP"), ...chunks]);
  return Buffer.concat([latin("RIFF"), u32le(body.length), body]);
}

describe("uploaded photos lose their hidden details", () => {
  test("JPEG: camera, location, AI labels, colour profile and comments go; the picture stays", () => {
    const clean = stripImageMetadata("image/jpeg", jpegWithMetadata());
    for (const secret of SECRETS) expect(has(clean, secret), secret).toBe(false);
    expect(clean.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(clean.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(has(clean, "JFIF")).toBe(true);
    expect(has(clean, "Adobe")).toBe(true);
    expect(clean.includes(Buffer.alloc(65, 7))).toBe(true);
    expect(clean.includes(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]))).toBe(true);
  });

  test("PNG: text, EXIF, colour profile and C2PA chunks go; the picture chunks stay", () => {
    const png = Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", Buffer.alloc(13, 1)),
      pngChunk("iCCP", latin("ICC_PROFILE")),
      pngChunk("tEXt", latin("Software\0made with midjourney")),
      pngChunk("eXIf", latin("MM\0*Canon EOS")),
      pngChunk("caBX", latin("c2pa")),
      pngChunk("IDAT", latin("pixels")),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    const clean = stripImageMetadata("image/png", png);
    for (const secret of SECRETS) expect(has(clean, secret), secret).toBe(false);
    expect(clean.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    for (const keep of ["IHDR", "IDAT", "pixels", "IEND"]) expect(has(clean, keep), keep).toBe(true);
  });

  test("WebP: EXIF, XMP and colour profile go, the header flags and size are fixed", () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x20 | 0x10 | 0x08 | 0x04;
    const webp = riff([webpChunk("VP8X", vp8x), webpChunk("ICCP", latin("ICC_PROFILE")), webpChunk("VP8L", latin("pixels!")), webpChunk("EXIF", latin("MM\0*Canon EOS")), webpChunk("XMP ", latin("<x>trainedAlgorithmicMedia</x>"))]);
    const clean = stripImageMetadata("image/webp", webp);
    for (const secret of SECRETS) expect(has(clean, secret), secret).toBe(false);
    expect(has(clean, "pixels!")).toBe(true);
    expect(clean.readUInt32LE(4)).toBe(clean.length - 8);
    expect(clean[20]).toBe(0x10);
  });

  test("a file that isn't the image type it claims is refused", () => {
    expect(() => stripImageMetadata("image/jpeg", latin("hello world"))).toThrow();
    expect(() => stripImageMetadata("image/png", jpegWithMetadata())).toThrow();
    expect(() => stripImageMetadata("image/webp", PNG_SIGNATURE)).toThrow();
    expect(() => stripImageMetadata("image/gif", latin("GIF89a"))).toThrow();
  });
});
