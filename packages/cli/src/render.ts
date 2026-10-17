import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { invertPixels, type TextRun } from "@everything-pdf/engine/pure";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { getDocument, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/** pdf.js types its context as the browser's; @napi-rs/canvas provides a compatible one. */
type RenderContext = Parameters<PDFPageProxy["render"]>[0]["canvasContext"];

// pdf.js needs its bundled font data to draw the 14 standard PDF fonts (Helvetica, Times…)
// that documents use without embedding.
const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = join(pdfjsRoot, "standard_fonts") + "/";
const cMapUrl = join(pdfjsRoot, "cmaps") + "/";

export interface RenderOptions {
  dpi: number;
  format: "png" | "jpg";
  /** JPEG quality, 0–1. */
  quality?: number;
  invert?: boolean;
  /** Draws on each rendered page before encoding (e.g. redaction boxes). */
  paint?: (ctx: SKRSContext2D, width: number, height: number, index: number) => void;
}

/**
 * Renders the given 0-based pages to PNG/JPEG bytes, rotation included, one at a time.
 * Returns images in the same order as `pageIndices`.
 */
export async function renderPages(
  bytes: Uint8Array,
  pageIndices: number[],
  { dpi, format, quality = 0.9, invert = false, paint }: RenderOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  const task = getDocument({
    data: bytes.slice(),
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const out: Uint8Array[] = [];
    for (const [i, index] of pageIndices.entries()) {
      onProgress?.(i, pageIndices.length);
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      // PDFs assume a white sheet; a fresh canvas is transparent.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: null,
        canvasContext: ctx as unknown as RenderContext,
        viewport,
      }).promise;
      page.cleanup();
      if (invert) invertCanvas(ctx, canvas.width, canvas.height);
      paint?.(ctx, canvas.width, canvas.height, i);
      const encoded =
        format === "png"
          ? await canvas.encode("png")
          : await canvas.encode("jpeg", Math.round(quality * 100));
      out.push(new Uint8Array(encoded));
    }
    onProgress?.(pageIndices.length, pageIndices.length);
    return out;
  } finally {
    await task.destroy();
  }
}

function invertCanvas(ctx: SKRSContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  invertPixels(image.data);
  ctx.putImageData(image, 0, 0);
}

/** The text on each page as runs with boxes (fractions of the displayed page, top-left origin). */
export async function textRunsOf(bytes: Uint8Array): Promise<TextRun[][]> {
  const task = getDocument({
    data: bytes.slice(),
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const pages: TextRun[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const runs: TextRun[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [a, b, c, d, e, f] = item.transform as number[];
        const along = Math.hypot(a!, b!) || 1;
        const across = Math.hypot(c!, d!) || 1;
        const dir = [a! / along, b! / along];
        const up = [c! / across, d! / across];
        const height = item.height || across;
        const base = [e! - up[0]! * height * 0.25, f! - up[1]! * height * 0.25];
        const corners = [
          base,
          [base[0]! + dir[0]! * item.width, base[1]! + dir[1]! * item.width],
          [
            base[0]! + dir[0]! * item.width + up[0]! * height * 1.25,
            base[1]! + dir[1]! * item.width + up[1]! * height * 1.25,
          ],
          [base[0]! + up[0]! * height * 1.25, base[1]! + up[1]! * height * 1.25],
        ].map(([x, y]) => viewport.convertToViewportPoint(x!, y!) as [number, number]);
        const xs = corners.map((q) => q[0]);
        const ys = corners.map((q) => q[1]);
        const [sx, sy] = viewport.convertToViewportPoint(e!, f!) as [number, number];
        const [tx, ty] = viewport.convertToViewportPoint(e! + dir[0]!, f! + dir[1]!) as [
          number,
          number,
        ];
        runs.push({
          text: item.str,
          x: Math.min(...xs) / viewport.width,
          y: Math.min(...ys) / viewport.height,
          width: (Math.max(...xs) - Math.min(...xs)) / viewport.width,
          height: (Math.max(...ys) - Math.min(...ys)) / viewport.height,
          vertical: tx - sx > Math.abs(ty - sy) ? undefined : true,
        });
      }
      page.cleanup();
      pages.push(runs);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
