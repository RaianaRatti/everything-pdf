import { grayscalePixels, invertPixels } from "@everything-pdf/engine/pure";
import type { PageItem, SourceFile } from "../store/workspace";
import { readBytes } from "./files";
import { canvasToBlob, openPdf, renderPage } from "./pdfjs";

export interface RasterOptions {
  dpi: number;
  format: "png" | "jpg";
  /** JPEG quality, 0–1. */
  quality?: number;
  invert?: boolean;
  grayscale?: boolean;
  /** Draws on top of each rendered page (e.g. redaction boxes), before encoding. */
  paint?: (ctx: CanvasRenderingContext2D, width: number, height: number, index: number) => void;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Renders workspace pages to image bytes, rotation included. Pages are rendered one at a
 * time so memory stays flat however long the document is.
 */
export async function rasterizePages(
  pages: PageItem[],
  files: Record<string, SourceFile>,
  {
    dpi,
    format,
    quality = 0.9,
    invert = false,
    grayscale = false,
    paint,
    onProgress,
  }: RasterOptions,
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const [i, page] of pages.entries()) {
    onProgress?.(i, pages.length);
    const file = files[page.fileId]!;
    const doc = await openPdf(file.id, file.bytes);
    const canvas = await renderPage(doc, page.pageIndex, {
      rotation: page.rotation,
      scale: dpi / 72,
    });

    if (invert || grayscale) {
      const ctx = canvas.getContext("2d")!;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (invert) invertPixels(image.data);
      if (grayscale) grayscalePixels(image.data);
      ctx.putImageData(image, 0, 0);
    }

    paint?.(canvas.getContext("2d")!, canvas.width, canvas.height, i);

    const blob = await canvasToBlob(canvas, format === "jpg" ? "image/jpeg" : "image/png", quality);
    out.push(await readBytes(blob));
    // Release the canvas's backing memory right away rather than waiting for GC.
    canvas.width = canvas.height = 0;
  }
  onProgress?.(pages.length, pages.length);
  return out;
}
