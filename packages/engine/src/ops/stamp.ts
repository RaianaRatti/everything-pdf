import { degrees } from "pdf-lib";
import { PdfEngineError } from "../errors";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { embedImage, type ImageInput } from "./images";

/**
 * A rectangle as fractions (0–1) of the page as displayed, origin top-left. Leave out `height`
 * to keep the image's own proportions on every page, whatever the page's shape.
 */
export interface RelativeRect {
  x: number;
  y: number;
  width: number;
  height?: number;
}

export interface StampPlacement {
  pageIndex: number;
  rect: RelativeRect;
}

/**
 * Draws an image (e.g. a signature) onto pages. Placement is given in the same terms a user
 * sees on screen, so it works regardless of the page's rotation.
 */
export async function stampImage(
  bytes: Uint8Array,
  image: ImageInput,
  placements: StampPlacement[],
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const embedded = await embedImage(doc, image);

  for (const { pageIndex, rect } of placements) {
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
      throw new PdfEngineError("bad-input", `Page ${pageIndex + 1} doesn't exist.`);
    }
    const page = doc.getPage(pageIndex);
    const frame = visualFrame(page);
    const width = rect.width * frame.width;
    const height =
      rect.height === undefined
        ? (width * embedded.height) / embedded.width
        : rect.height * frame.height;
    const vx = rect.x * frame.width;
    const vy = frame.height - rect.y * frame.height - height;
    const { x, y } = visualToPage(page, vx, vy);
    page.drawImage(embedded, { x, y, width, height, rotate: degrees(frame.rotation) });
  }

  return doc.save({ useObjectStreams: true });
}
