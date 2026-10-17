import { PDFDocument, PDFPage, degrees, type PDFEmbeddedPage } from "pdf-lib";
import { PdfEngineError } from "../errors";
import { visualFrame } from "../geometry";
import { loadPdf } from "../load";
import { PAPER_SIZES, type PaperSize } from "../presets";

/**
 * Print layouts: several pages per sheet, booklets, posters, and splitting two-page scans.
 * They redraw pages onto new sheets, so links and form fields don't carry over (except for
 * splitting, which keeps everything).
 */

interface Placed {
  embedded: PDFEmbeddedPage;
  page: PDFPage;
}

/** Embeds every page (its visible crop area), keeping track of its rotation. */
async function embedAll(src: PDFDocument, out: PDFDocument): Promise<Placed[]> {
  const pages = src.getPages();
  const embedded = await out.embedPages(
    pages,
    pages.map((p) => {
      const { x, y, width, height } = p.getCropBox();
      return { left: x, bottom: y, right: x + width, top: y + height };
    }),
  );
  return pages.map((page, i) => ({ embedded: embedded[i]!, page }));
}

/**
 * Draws a page upright, scaled to fit (centered) in a box on `sheet`. Returns nothing; a
 * missing page (padding) leaves the box empty.
 */
function drawFitted(
  sheet: PDFPage,
  item: Placed | undefined,
  box: { x: number; y: number; width: number; height: number },
  fill = false,
): void {
  if (!item) return;
  const frame = visualFrame(item.page);
  const s = fill
    ? Math.max(box.width / frame.width, box.height / frame.height)
    : Math.min(box.width / frame.width, box.height / frame.height);
  const w = frame.width * s;
  const h = frame.height * s;
  const x0 = box.x + (box.width - w) / 2;
  const y0 = box.y + (box.height - h) / 2;
  const { width: cw, height: ch } = item.page.getCropBox();
  // Embedded pages are unrotated: turn them clockwise by the page's rotation, then shift back.
  const offset: Record<number, [number, number]> = {
    0: [0, 0],
    90: [0, cw * s],
    180: [cw * s, ch * s],
    270: [ch * s, 0],
  };
  const [dx, dy] = offset[frame.rotation]!;
  sheet.drawPage(item.embedded, {
    x: x0 + dx,
    y: y0 + dy,
    xScale: s,
    yScale: s,
    rotate: degrees(-frame.rotation),
  });
}

function sheetSize(size: PaperSize, landscape: boolean): [number, number] {
  const [w, h] = PAPER_SIZES[size];
  return landscape ? [h, w] : [w, h];
}

export interface NUpOptions {
  /** Pages per sheet. */
  perSheet: 2 | 4 | 6 | 9 | 16;
  size: PaperSize;
  /** White space around the sheet and between pages, in points. */
  margin: number;
  gap: number;
  /** Draw a thin border around each page. */
  borders: boolean;
}

/** Puts several pages on each sheet, in reading order (left to right, top to bottom). */
export async function nUp(bytes: Uint8Array, options: NUpOptions): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const items = await embedAll(src, out);
  const grids: Record<NUpOptions["perSheet"], [number, number]> = {
    2: [2, 1],
    4: [2, 2],
    6: [3, 2],
    9: [3, 3],
    16: [4, 4],
  };
  // Pick the sheet orientation that makes the cells closest to the pages' own shape.
  const first = visualFrame(src.getPage(0));
  const portraitPages = first.height >= first.width;
  let [cols, rows] = grids[options.perSheet];
  const landscape =
    options.perSheet === 2 || options.perSheet === 6 ? portraitPages : !portraitPages;
  if (!landscape && cols > rows) [cols, rows] = [rows, cols];
  const [sw, sh] = sheetSize(options.size, landscape);

  const cellW = (sw - options.margin * 2 - options.gap * (cols - 1)) / cols;
  const cellH = (sh - options.margin * 2 - options.gap * (rows - 1)) / rows;
  if (cellW <= 0 || cellH <= 0) throw new PdfEngineError("bad-input", "The margins are too big.");

  for (let i = 0; i < items.length; i += cols * rows) {
    const sheet = out.addPage([sw, sh]);
    for (let k = 0; k < cols * rows; k++) {
      const item = items[i + k];
      if (!item) break;
      const col = k % cols;
      const row = Math.floor(k / cols);
      const box = {
        x: options.margin + col * (cellW + options.gap),
        y: sh - options.margin - (row + 1) * cellH - row * options.gap,
        width: cellW,
        height: cellH,
      };
      drawFitted(sheet, item, box);
      if (options.borders) {
        sheet.drawRectangle({ ...box, borderWidth: 0.5, opacity: 0, borderOpacity: 0.6 });
      }
    }
  }
  return out.save({ useObjectStreams: true });
}

/** Sheet order for a saddle-stitched booklet: [left, right] page numbers per side, 0-based. */
export function bookletOrder(pageCount: number): [number, number][] {
  const total = Math.ceil(pageCount / 4) * 4;
  const sides: [number, number][] = [];
  for (let i = 0; i < total / 4; i++) {
    sides.push([total - 1 - 2 * i, 2 * i]); // front of sheet
    sides.push([2 * i + 1, total - 2 - 2 * i]); // back of sheet
  }
  return sides;
}

/**
 * Arranges pages for printing double-sided and folding in half: two pages per landscape side,
 * in the order that makes a booklet once folded. Blank pages pad the end to a multiple of 4.
 * Print with "flip on short edge".
 */
export async function booklet(
  bytes: Uint8Array,
  options: { size: PaperSize; margin: number },
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const items = await embedAll(src, out);
  const [sw, sh] = sheetSize(options.size, true);
  const half = sw / 2;
  for (const [left, right] of bookletOrder(items.length)) {
    const sheet = out.addPage([sw, sh]);
    const m = options.margin;
    drawFitted(sheet, items[left], { x: m, y: m, width: half - m * 1.5, height: sh - m * 2 });
    drawFitted(sheet, items[right], {
      x: half + m / 2,
      y: m,
      width: half - m * 1.5,
      height: sh - m * 2,
    });
  }
  return out.save({ useObjectStreams: true });
}

/**
 * Enlarges one page across a grid of sheets, to print and tape together. Neighboring tiles
 * overlap by `overlap` points so there's room to glue.
 */
export async function poster(
  bytes: Uint8Array,
  options: { pageIndex: number; columns: number; rows: number; size: PaperSize; overlap: number },
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  if (options.pageIndex < 0 || options.pageIndex >= src.getPageCount()) {
    throw new PdfEngineError("bad-input", `Page ${options.pageIndex + 1} doesn't exist.`);
  }
  const out = await PDFDocument.create();
  const item = (await embedAll(src, out))[options.pageIndex]!;
  const frame = visualFrame(item.page);
  const landscape = frame.width > frame.height;
  const [tw, th] = sheetSize(options.size, landscape);
  const { columns, rows, overlap } = options;
  // The whole poster, minus the overlaps.
  const totalW = columns * tw - (columns - 1) * overlap;
  const totalH = rows * th - (rows - 1) * overlap;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const sheet = out.addPage([tw, th]);
      // Draw the whole enlarged page, shifted so this tile's part lands on the sheet; the rest
      // falls outside the sheet and isn't shown.
      const offsetX = -col * (tw - overlap);
      const offsetY = -(rows - 1 - row) * (th - overlap);
      drawFitted(sheet, item, { x: offsetX, y: offsetY, width: totalW, height: totalH });
    }
  }
  return out.save({ useObjectStreams: true });
}

/**
 * Splits each two-page spread (e.g. a scanned open book) into its halves. Content isn't
 * redrawn, just cropped, so text, links and quality are untouched.
 */
export async function splitSpreads(
  bytes: Uint8Array,
  options: { direction: "vertical" | "horizontal"; rightToLeft?: boolean },
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const count = src.getPageCount();
  const copies = await out.copyPages(
    src,
    Array.from({ length: count }, (_, i) => i),
  );

  for (let i = 0; i < count; i++) {
    // Two page objects sharing content and resources; each gets half of the crop box.
    const first = copies[i]!;
    const node = first.node.clone(out.context);
    const second = PDFPage.of(node, out.context.register(node), out);
    const frame = visualFrame(first);
    const { x, y, width, height } = first.getCropBox();
    // "Vertical" splits along a vertical line as displayed: left and right halves.
    const splitDisplayedWidth = options.direction === "vertical";
    // Displayed width runs along the page's own height when it's rotated by 90 or 270.
    const alongPageWidth = splitDisplayedWidth === (frame.rotation % 180 === 0);
    let halves = alongPageWidth
      ? [
          [x, y, width / 2, height],
          [x + width / 2, y, width / 2, height],
        ]
      : [
          [x, y + height / 2, width, height / 2],
          [x, y, width, height / 2],
        ];
    // Order halves as they read on screen (left before right, top before bottom).
    const reversedByRotation =
      (alongPageWidth && (frame.rotation === 180 || frame.rotation === 270)) ||
      (!alongPageWidth && (frame.rotation === 90 || frame.rotation === 180));
    if (reversedByRotation) halves = [halves[1]!, halves[0]!];
    if (options.rightToLeft && splitDisplayedWidth) halves = [halves[1]!, halves[0]!];
    first.setCropBox(...(halves[0] as [number, number, number, number]));
    second.setCropBox(...(halves[1] as [number, number, number, number]));
    out.addPage(first);
    out.addPage(second);
  }
  return out.save({ useObjectStreams: true });
}
