/**
 * Image math for scanning documents with a camera: find the sheet of paper, flatten it with a
 * perspective correction, and clean it up. Works on raw RGBA pixels, so it runs anywhere.
 */

export interface Point {
  x: number;
  y: number;
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** Otsu's method: the gray level that best separates dark and light pixels. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t]!;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t]!;
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function toGray(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000;
  }
  return gray;
}

/**
 * Finds a sheet of paper: the largest bright region, and its four extreme corners. Expects a
 * small image (a few hundred pixels across). Returns corners in pixels, or null if nothing
 * covering at least a fifth of the image stands out.
 */
export function detectDocument(gray: Uint8Array, width: number, height: number): Quad | null {
  const threshold = otsuThreshold(gray);
  const label = new Int32Array(width * height).fill(-1);
  let bestSize = 0;
  let bestLabel = -1;
  const queue = new Int32Array(width * height);
  let next = 0;

  for (let start = 0; start < gray.length; start++) {
    if (label[start] !== -1 || gray[start]! <= threshold) continue;
    // Flood-fill this bright region.
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % width;
      const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
      for (const q of neighbors) {
        if (q < 0 || q >= gray.length || label[q] !== -1 || gray[q]! <= threshold) continue;
        label[q] = next;
        queue[tail++] = q;
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = next;
    }
    next++;
  }
  if (bestSize < width * height * 0.2) return null;

  // Corners are the region's extremes along the diagonals.
  let tl = { x: 0, y: 0, s: Infinity };
  let br = { x: 0, y: 0, s: -Infinity };
  let tr = { x: 0, y: 0, s: -Infinity };
  let bl = { x: 0, y: 0, s: Infinity };
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== bestLabel) continue;
    const x = p % width;
    const y = (p - x) / width;
    if (x + y < tl.s) tl = { x, y, s: x + y };
    if (x + y > br.s) br = { x, y, s: x + y };
    if (x - y > tr.s) tr = { x, y, s: x - y };
    if (x - y < bl.s) bl = { x, y, s: x - y };
  }
  return [
    { x: tl.x, y: tl.y },
    { x: tr.x, y: tr.y },
    { x: br.x, y: br.y },
    { x: bl.x, y: bl.y },
  ];
}

/** Solves A·x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) throw new Error("Singular matrix");
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / p;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * The perspective transform (3×3, row-major, last entry 1) taking each `from` corner to the
 * matching `to` corner.
 */
export function homography(from: Quad, to: Quad): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(a, b), 1];
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!;
  return { x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w, y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for a flattened quad: the average lengths of opposite sides, capped. */
export function flattenedSize(quad: Quad, maxSide = 2480): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  let width = (dist(tl, tr) + dist(bl, br)) / 2;
  let height = (dist(tl, bl) + dist(tr, br)) / 2;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  return { width, height };
}

/**
 * Flattens the quad of `src` into a straight rectangle of the given size (bilinear sampling).
 */
export function warpPerspective(
  src: Uint8ClampedArray | Uint8Array,
  srcWidth: number,
  srcHeight: number,
  quad: Quad,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  // Map output pixels back into the source.
  const h = homography(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    quad,
  );
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = h[6]! * (x + 0.5) + h[7]! * (y + 0.5) + h[8]!;
      const sx = (h[0]! * (x + 0.5) + h[1]! * (y + 0.5) + h[2]!) / w - 0.5;
      const sy = (h[3]! * (x + 0.5) + h[4]! * (y + 0.5) + h[5]!) / w - 0.5;
      const x0 = Math.max(0, Math.min(srcWidth - 1, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(srcHeight - 1, Math.floor(sy)));
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const y1 = Math.min(srcHeight - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top =
          src[(y0 * srcWidth + x0) * 4 + c]! * (1 - fx) + src[(y0 * srcWidth + x1) * 4 + c]! * fx;
        const bottom =
          src[(y1 * srcWidth + x0) * 4 + c]! * (1 - fx) + src[(y1 * srcWidth + x1) * 4 + c]! * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

export type ScanFilter = "color" | "gray" | "bw";

/** The value below which `fraction` of the samples fall. */
function percentile(
  values: Uint8Array | Uint8ClampedArray,
  stride: number,
  offset: number,
  fraction: number,
): number {
  const hist = new Array<number>(256).fill(0);
  let total = 0;
  for (let i = offset; i < values.length; i += stride) {
    hist[values[i]!]!++;
    total++;
  }
  let count = 0;
  for (let v = 0; v < 256; v++) {
    count += hist[v]!;
    if (count >= total * fraction) return v;
  }
  return 255;
}

/**
 * Makes a photo of a page look like a scan. Paper is most of the picture, so its brightness
 * (a high percentile, per color channel) becomes white, which also removes a color cast from
 * the lighting; anything much darker than the paper becomes black. "gray" drops color; "bw"
 * goes pure black and white (best for text).
 */
export function enhanceScan(rgba: Uint8ClampedArray, filter: ScanFilter): void {
  const levels = (white: number) => {
    const w = Math.max(40, white);
    const b = w * 0.35;
    return (v: number) => Math.max(0, Math.min(255, ((v - b) * 255) / (w - b)));
  };

  if (filter === "color") {
    const channel = [0, 1, 2].map((c) => levels(percentile(rgba, 4, c, 0.92)));
    for (let o = 0; o < rgba.length; o += 4) {
      rgba[o] = channel[0]!(rgba[o]!);
      rgba[o + 1] = channel[1]!(rgba[o + 1]!);
      rgba[o + 2] = channel[2]!(rgba[o + 2]!);
    }
    return;
  }

  const gray = toGray(rgba);
  const stretch = levels(percentile(gray, 1, 0, 0.92));
  const leveled = gray.map(stretch);
  const cut = filter === "bw" ? Math.min(200, otsuThreshold(leveled)) : 0;
  for (let i = 0; i < leveled.length; i++) {
    const v = leveled[i]!;
    const out = filter === "bw" ? (v > cut ? 255 : 0) : v;
    const o = i * 4;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = out;
  }
}
