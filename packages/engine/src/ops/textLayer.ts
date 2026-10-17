import {
  PDFOperator,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from "pdf-lib";
import { PdfEngineError } from "../errors";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";

/** A recognized word and its box, as fractions of the page as displayed (origin top-left). */
export interface OcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageText {
  pageIndex: number;
  words: OcrWord[];
}

/**
 * Adds invisible, selectable text over each recognized word (what makes a scan searchable).
 * The page looks exactly the same. Characters the standard font can't encode are left out.
 */
export async function addTextLayer(bytes: Uint8Array, pages: PageText[]): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const encodable = (ch: string) => {
    try {
      font.encodeText(ch);
      return true;
    } catch {
      return false;
    }
  };

  for (const { pageIndex, words } of pages) {
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
      throw new PdfEngineError("bad-input", `Page ${pageIndex + 1} doesn't exist.`);
    }
    const page = doc.getPage(pageIndex);
    const frame = visualFrame(page);
    const fontKey = page.node.newFontDictionary("OCR", font.ref);
    const rad = (frame.rotation * Math.PI) / 180;
    const [cos, sin] = [Math.cos(rad), Math.sin(rad)];

    const ops: PDFOperator[] = [
      pushGraphicsState(),
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
    ];
    for (const word of words) {
      const text = [...word.text.trim()].filter(encodable).join("");
      if (!text) continue;
      const boxW = word.width * frame.width;
      const boxH = word.height * frame.height;
      if (boxW <= 0 || boxH <= 0) continue;
      // The box spans ascenders to descenders; put the baseline about a fifth of the way up.
      const size = boxH;
      const natural = font.widthOfTextAtSize(text, size);
      const { x, y } = visualToPage(
        page,
        word.x * frame.width,
        (1 - word.y - word.height) * frame.height + boxH * 0.2,
      );
      ops.push(
        setFontAndSize(fontKey, size),
        // Stretch or squeeze horizontally so the text covers the word exactly.
        setCharacterSqueeze(natural > 0 ? (boxW / natural) * 100 : 100),
        setTextMatrix(cos, sin, -sin, cos, x, y),
        showText(font.encodeText(text)),
      );
    }
    ops.push(endText(), popGraphicsState());
    page.pushOperators(...ops);
  }
  return doc.save({ useObjectStreams: true });
}
