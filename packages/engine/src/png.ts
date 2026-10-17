import { zlibSync } from "fflate";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encodes 8-bit pixels as a PNG. `channels`: 1 gray, 2 gray+alpha, 3 RGB, 4 RGBA. */
export function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 2 | 3 | 4,
): Uint8Array {
  const stride = width * channels;
  // Each row starts with a filter-type byte; 0 = no filter.
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Undoes PNG row predictors (PDF /Predictor 10–15) in place of a fresh buffer. */
export function unpredictPng(
  data: Uint8Array,
  bytesPerPixel: number,
  rowBytes: number,
): Uint8Array {
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let y = 0; y < rows; y++) {
    const filter = data[y * (rowBytes + 1)]!;
    const src = y * (rowBytes + 1) + 1;
    const dst = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[src + x]!;
      const left = x >= bytesPerPixel ? out[dst + x - bytesPerPixel]! : 0;
      const up = y > 0 ? out[dst - rowBytes + x]! : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[dst - rowBytes + x - bytesPerPixel]! : 0;
      let value: number;
      switch (filter) {
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          value = raw;
      }
      out[dst + x] = value & 0xff;
    }
  }
  return out;
}
