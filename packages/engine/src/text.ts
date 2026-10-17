import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import { PdfEngineError } from "./errors";
import type { VisualFrame } from "./geometry";

export type FontFamily = "sans" | "serif" | "mono";

const FAMILIES: Record<FontFamily, { regular: StandardFonts; bold: StandardFonts }> = {
  sans: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  serif: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  mono: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold },
};

export function embedFamily(doc: PDFDocument, family: FontFamily, bold = false): Promise<PDFFont> {
  const f = FAMILIES[family];
  return doc.embedFont(bold ? f.bold : f.regular);
}

/** Whether a standard (Latin-only, WinAnsi) font can draw this text. */
export function canDraw(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Throws a user-facing error if the standard fonts can't draw the text. */
export function assertDrawable(font: PDFFont, text: string, what = "The text"): void {
  if (!canDraw(font, text)) {
    throw new PdfEngineError(
      "bad-input",
      `${what} has characters that can't be drawn yet. Use Latin letters, numbers and punctuation.`,
    );
  }
}

export type Corner =
  "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

/**
 * Where a line of text starts (its baseline's left end) so it sits in a corner or edge of the
 * page as displayed, `margin` points from the edges. Visual coordinates, origin bottom-left.
 */
export function cornerPoint(
  frame: VisualFrame,
  corner: Corner,
  textWidth: number,
  fontSize: number,
  margin: number,
): { vx: number; vy: number } {
  const [vertical, horizontal] = corner.split("-") as [string, string];
  const vx =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? frame.width - margin - textWidth
        : (frame.width - textWidth) / 2;
  const vy = vertical === "top" ? frame.height - margin - fontSize : margin;
  return { vx, vy };
}
