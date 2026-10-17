import { StandardFonts, degrees, rgb } from "pdf-lib";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { defaultPageNumberOptions, formatPageNumber, type PageNumberOptions } from "../presets";
import { cornerPoint } from "../text";

export async function addPageNumbers(
  bytes: Uint8Array,
  options: Partial<PageNumberOptions> = {},
): Promise<Uint8Array> {
  const opts = { ...defaultPageNumberOptions, ...options };
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const numbered = opts.skipFirst ? pages.slice(1) : pages;
  const total = opts.startAt + numbered.length - 1;

  numbered.forEach((page, i) => {
    const text = formatPageNumber(opts.format, opts.startAt + i, total);
    const frame = visualFrame(page);
    const { vx, vy } = cornerPoint(
      frame,
      opts.position,
      font.widthOfTextAtSize(text, opts.fontSize),
      opts.fontSize,
      opts.margin,
    );
    const { x, y } = visualToPage(page, vx, vy);
    page.drawText(text, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
      rotate: degrees(frame.rotation),
    });
  });

  return doc.save({ useObjectStreams: true });
}
