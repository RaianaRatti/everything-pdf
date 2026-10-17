import { PDFDocument, type PDFImage } from "pdf-lib";
import { PdfEngineError } from "../errors";
import { loadPdf } from "../load";
import type { ImageType } from "../sniff";

export interface ImageInput {
  bytes: Uint8Array;
  type: ImageType;
}

export async function embedImage(doc: PDFDocument, image: ImageInput): Promise<PDFImage> {
  return image.type === "png" ? doc.embedPng(image.bytes) : doc.embedJpg(image.bytes);
}

export type PageSizeName = "fit" | "a4" | "letter";

export interface ImagesToPdfOptions {
  /** "fit" makes each page exactly the image's size. */
  pageSize: PageSizeName;
  orientation: "auto" | "portrait" | "landscape";
  /** Margin in points around the image (ignored for "fit"). */
  margin: number;
}

const PAGE_SIZES: Record<Exclude<PageSizeName, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/** Treat image pixels as CSS pixels (96 DPI) when sizing "fit" pages. */
const PX_TO_PT = 72 / 96;

export async function imagesToPdf(
  images: ImageInput[],
  options: Partial<ImagesToPdfOptions> = {},
): Promise<Uint8Array> {
  const opts: ImagesToPdfOptions = { pageSize: "fit", orientation: "auto", margin: 0, ...options };
  if (images.length === 0) throw new PdfEngineError("bad-input", "Add at least one image.");

  const doc = await PDFDocument.create();
  for (const input of images) {
    const image = await embedImage(doc, input);
    const imgW = image.width * PX_TO_PT;
    const imgH = image.height * PX_TO_PT;

    if (opts.pageSize === "fit") {
      const page = doc.addPage([imgW, imgH]);
      page.drawImage(image, { x: 0, y: 0, width: imgW, height: imgH });
      continue;
    }

    let [pw, ph] = PAGE_SIZES[opts.pageSize];
    const landscape =
      opts.orientation === "landscape" || (opts.orientation === "auto" && imgW > imgH);
    if (landscape) [pw, ph] = [ph, pw];

    const page = doc.addPage([pw, ph]);
    const boxW = pw - opts.margin * 2;
    const boxH = ph - opts.margin * 2;
    const scale = Math.min(boxW / imgW, boxH / imgH);
    const w = imgW * scale;
    const h = imgH * scale;
    page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return doc.save({ useObjectStreams: true });
}

export interface PageImage extends ImageInput {
  pageIndex: number;
}

/**
 * Replaces the given pages with full-page images, sized to how each page is displayed
 * (rotation baked in). Used by raster operations such as invert colors.
 */
export async function replacePagesWithImages(
  bytes: Uint8Array,
  replacements: PageImage[],
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const byIndex = new Map(replacements.map((r) => [r.pageIndex, r]));

  for (let i = 0; i < doc.getPageCount(); i++) {
    const replacement = byIndex.get(i);
    if (!replacement) continue;
    const old = doc.getPage(i);
    const rotated = old.getRotation().angle % 180 !== 0;
    const { width, height } = old.getCropBox();
    const [w, h] = rotated ? [height, width] : [width, height];

    const image = await embedImage(doc, replacement);
    doc.removePage(i);
    const page = doc.insertPage(i, [w, h]);
    page.drawImage(image, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save({ useObjectStreams: true });
}
