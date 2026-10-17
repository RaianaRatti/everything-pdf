import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

type LoadingTask = ReturnType<typeof getDocument>;
const open = new Map<string, LoadingTask>();

/** Opens (or reuses) a pdf.js document for rendering. pdf.js parses in its own worker. */
export function openPdf(id: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let task = open.get(id);
  if (!task) {
    // pdf.js takes ownership of (detaches) the buffer it's given, so hand it a copy.
    task = getDocument({ data: bytes.slice(), verbosity: 0 });
    open.set(id, task);
  }
  return task.promise;
}

/** Closes documents that are no longer in use. They're reopened on demand (e.g. after undo). */
export function closeUnusedPdfs(keep: Set<string>): void {
  for (const [id, task] of open) {
    if (!keep.has(id)) {
      void task.destroy();
      open.delete(id);
    }
  }
}

/** Browsers refuse very large canvases; stay well under the strictest limit (iOS Safari). */
const MAX_CANVAS_PIXELS = 16_000_000;

export interface RenderOptions {
  /** Extra clockwise rotation on top of the page's own. */
  rotation?: number;
  /** Either a fixed scale (1 = 72 DPI) or a target width in device pixels. */
  scale?: number;
  width?: number;
}

export async function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  { rotation = 0, scale, width }: RenderOptions,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  const totalRotation = (((page.rotate + rotation) % 360) + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation: totalRotation });
  let s = scale ?? (width ? width / base.width : 1);
  s = Math.min(s, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)));
  const viewport = page.getViewport({ scale: s, rotation: totalRotation });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode image."))),
      type,
      quality,
    ),
  );
}

/** A page's size in points as displayed (rotation included). */
export async function pageSizeInPoints(
  doc: PDFDocumentProxy,
  pageIndex: number,
  rotation = 0,
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  return { width: viewport.width, height: viewport.height };
}
