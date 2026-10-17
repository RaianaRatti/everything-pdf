import { PDFDocument } from "pdf-lib";
import { PdfEngineError } from "./errors";
import { readInfo, type FullDocInfo } from "./metadata";
import { readOutline, type Bookmark } from "./outline";

/** Loads a PDF with pdf-lib, translating failures into PdfEngineErrors. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    // pdf-lib's EncryptedPDFError can't be detected with instanceof (it's compiled to ES5),
    // so load regardless and check the flag ourselves.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    throw new PdfEngineError(
      "invalid",
      "This file couldn't be read as a PDF. It may be corrupted.",
    );
  }
  if (doc.isEncrypted) {
    throw new PdfEngineError(
      "encrypted",
      "This PDF is password-protected. Unlocking protected PDFs isn't supported yet.",
    );
  }
  return doc;
}

export interface PdfInfo {
  pageCount: number;
  info: FullDocInfo;
  outline: Bookmark[];
}

/** Validates a PDF and returns basic facts about it. Throws PdfEngineError if unusable. */
export async function inspect(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await loadPdf(bytes);
  return { pageCount: doc.getPageCount(), info: readInfo(doc), outline: readOutline(doc) };
}
