import { PDFDocument, degrees } from "pdf-lib";
import { PdfEngineError } from "../errors";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { PAPER_SIZES, type ResizeOptions } from "../presets";
import type { RelativeRect } from "./stamp";

export interface CropPlacement {
  pageIndex: number;
  /** The area to keep, as fractions of the page as displayed (origin top-left). */
  rect: Required<RelativeRect>;
}

/**
 * Crops pages to the given areas by setting their crop box. The cut-away content is hidden, not
 * deleted, so it can still be recovered from the file.
 */
export async function cropPages(
  bytes: Uint8Array,
  placements: CropPlacement[],
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  for (const { pageIndex, rect } of placements) {
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
      throw new PdfEngineError("bad-input", `Page ${pageIndex + 1} doesn't exist.`);
    }
    if (rect.width <= 0 || rect.height <= 0) {
      throw new PdfEngineError("bad-input", "The crop area is empty.");
    }
    const page = doc.getPage(pageIndex);
    const frame = visualFrame(page);
    // Opposite corners in visual space (origin bottom-left), then into page space.
    const a = visualToPage(page, rect.x * frame.width, (1 - rect.y) * frame.height);
    const b = visualToPage(
      page,
      (rect.x + rect.width) * frame.width,
      (1 - rect.y - rect.height) * frame.height,
    );
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    page.setCropBox(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
  return doc.save({ useObjectStreams: true });
}

/**
 * Puts every page on a standard paper size, scaling its content to fit (centered, never
 * distorted). Pages come out upright: their rotation is baked in. Links and form fields on the
 * page don't survive, because the content is redrawn rather than copied.
 */
export async function resizePages(bytes: Uint8Array, options: ResizeOptions): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const pages = src.getPages();
  const embedded = await out.embedPages(
    pages,
    pages.map((p) => {
      const { x, y, width, height } = p.getCropBox();
      return { left: x, bottom: y, right: x + width, top: y + height };
    }),
  );

  pages.forEach((page, i) => {
    const frame = visualFrame(page);
    let [pw, ph] = PAPER_SIZES[options.size];
    const landscape =
      options.orientation === "landscape" ||
      (options.orientation === "auto" && frame.width > frame.height);
    if (landscape) [pw, ph] = [ph, pw];

    const margin = Math.min(options.margin, pw / 4, ph / 4);
    const s = Math.min((pw - margin * 2) / frame.width, (ph - margin * 2) / frame.height);
    const w = frame.width * s;
    const h = frame.height * s;
    const x0 = (pw - w) / 2;
    const y0 = (ph - h) / 2;

    // The embedded page is unrotated; turn it clockwise by the page's rotation, then shift it
    // back into the box (rotating about the origin swings it out of place).
    const { width: cw, height: ch } = page.getCropBox();
    const offset: Record<number, [number, number]> = {
      0: [0, 0],
      90: [0, cw * s],
      180: [cw * s, ch * s],
      270: [ch * s, 0],
    };
    const [dx, dy] = offset[frame.rotation]!;
    out.addPage([pw, ph]).drawPage(embedded[i]!, {
      x: x0 + dx,
      y: y0 + dy,
      xScale: s,
      yScale: s,
      rotate: degrees(-frame.rotation),
    });
  });

  return out.save({ useObjectStreams: true });
}
