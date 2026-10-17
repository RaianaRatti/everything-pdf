import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { invertPixels } from "@everything-pdf/engine/pure";
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
}

/**
 * Renders the given 0-based pages to PNG/JPEG bytes, rotation included, one at a time.
 * Returns images in the same order as `pageIndices`.
 */
export async function renderPages(
  bytes: Uint8Array,
  pageIndices: number[],
  { dpi, format, quality = 0.9, invert = false }: RenderOptions,
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
