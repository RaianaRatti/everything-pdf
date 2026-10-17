import { StandardFonts, degrees, rgb } from "pdf-lib";
import { PdfEngineError } from "../errors";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { defaultWatermarkOptions, type WatermarkOptions } from "../presets";
import { assertDrawable } from "../text";
import { embedImage, type ImageInput } from "./images";

/** Draws the same text, centered and semi-transparent, on every page. */
export async function addWatermark(
  bytes: Uint8Array,
  options: Partial<WatermarkOptions> = {},
): Promise<Uint8Array> {
  const opts = { ...defaultWatermarkOptions, ...options };
  const text = opts.text.trim();
  if (!text) throw new PdfEngineError("bad-input", "Enter some watermark text.");

  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  assertDrawable(font, text, "The watermark text");
  const unitWidth = font.widthOfTextAtSize(text, 1);
  const capHeight = font.heightAtSize(1, { descender: false });

  for (const page of doc.getPages()) {
    const frame = visualFrame(page);
    // Angle in visual space, counter-clockwise: corner to corner for diagonal.
    const angle = opts.layout === "diagonal" ? Math.atan2(frame.height, frame.width) : 0;
    const span = opts.layout === "diagonal" ? Math.hypot(frame.width, frame.height) : frame.width;
    const size = (span * opts.scale) / unitWidth;

    // Start the baseline so the text's center sits on the page's center.
    const [halfW, halfH] = [(unitWidth * size) / 2, (capHeight * size) / 2];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vx = frame.width / 2 - (halfW * cos - halfH * sin);
    const vy = frame.height / 2 - (halfW * sin + halfH * cos);

    const { x, y } = visualToPage(page, vx, vy);
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(0.35, 0.35, 0.35),
      opacity: opts.opacity,
      rotate: degrees(frame.rotation + (angle * 180) / Math.PI),
    });
  }

  return doc.save({ useObjectStreams: true });
}

/**
 * Draws an image (e.g. a logo) centered on every page, upright as displayed. `scale` is its width
 * as a fraction of the page's displayed width.
 */
export async function addImageWatermark(
  bytes: Uint8Array,
  image: ImageInput,
  options: { scale?: number; opacity?: number } = {},
): Promise<Uint8Array> {
  const { scale = 0.5, opacity = 0.2 } = options;
  const doc = await loadPdf(bytes);
  const embedded = await embedImage(doc, image);

  for (const page of doc.getPages()) {
    const frame = visualFrame(page);
    let width = frame.width * scale;
    let height = (width * embedded.height) / embedded.width;
    // Tall images on wide pages: fit the height instead.
    if (height > frame.height * scale) {
      height = frame.height * scale;
      width = (height * embedded.width) / embedded.height;
    }
    const { x, y } = visualToPage(page, (frame.width - width) / 2, (frame.height - height) / 2);
    page.drawImage(embedded, { x, y, width, height, opacity, rotate: degrees(frame.rotation) });
  }

  return doc.save({ useObjectStreams: true });
}
