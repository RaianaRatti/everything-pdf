import { PDFDocument } from "pdf-lib";
import { PdfEngineError } from "../errors";

/** A PDF of empty pages, for inserting blank pages into a document. */
export async function blankPdf(width: number, height: number, count = 1): Promise<Uint8Array> {
  if (!(width > 0 && height > 0 && count >= 1)) {
    throw new PdfEngineError("bad-input", "A blank page needs a size and a count.");
  }
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([width, height]);
  return doc.save();
}
