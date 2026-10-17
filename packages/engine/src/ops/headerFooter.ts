import { StandardFonts, degrees, rgb } from "pdf-lib";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { defaultHeaderFooterOptions, expandTemplate, type HeaderFooterOptions } from "../presets";
import { assertDrawable, cornerPoint, type Corner } from "../text";

const HORIZONTAL = ["left", "center", "right"] as const;

/** Adds header and footer text, with {page}, {total}, {file} and {date} filled in per page. */
export async function addHeaderFooter(
  bytes: Uint8Array,
  options: Partial<HeaderFooterOptions> = {},
): Promise<Uint8Array> {
  const opts = { ...defaultHeaderFooterOptions, ...options };
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const targets = opts.skipFirst ? pages.slice(1) : pages;
  const total = pages.length;

  const slots = (["top", "bottom"] as const).flatMap((vertical) =>
    (vertical === "top" ? opts.header : opts.footer).map((template, i) => ({
      corner: `${vertical}-${HORIZONTAL[i]}` as Corner,
      template: template.trim(),
    })),
  );
  for (const { template } of slots) assertDrawable(font, template, "The header or footer");

  targets.forEach((page) => {
    const number = pages.indexOf(page) + 1;
    const frame = visualFrame(page);
    for (const { corner, template } of slots) {
      if (!template) continue;
      const text = expandTemplate(template, {
        page: number,
        total,
        file: opts.fileName,
        date: opts.date,
      });
      assertDrawable(font, text, "The file name or date");
      const { vx, vy } = cornerPoint(
        frame,
        corner,
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
        color: rgb(0.2, 0.2, 0.2),
        rotate: degrees(frame.rotation),
      });
    }
  });

  return doc.save({ useObjectStreams: true });
}
