import { PDFDocument } from "pdf-lib";
import { PdfEngineError } from "../errors";
import { loadPdf } from "../load";
import { planSplit, type SplitMode } from "../ranges";

export interface SplitPart {
  /** 0-based page indices from the source that ended up in this part. */
  pages: number[];
  bytes: Uint8Array;
}

/** Builds one PDF per group of 0-based page indices. */
export async function extractGroups(bytes: Uint8Array, groups: number[][]): Promise<SplitPart[]> {
  const src = await loadPdf(bytes);
  const parts: SplitPart[] = [];
  for (const pages of groups) {
    if (pages.length === 0) continue;
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(src, pages)) out.addPage(page);
    parts.push({ pages, bytes: await out.save({ useObjectStreams: true }) });
  }
  if (parts.length === 0) throw new PdfEngineError("bad-input", "No pages were selected.");
  return parts;
}

export async function split(bytes: Uint8Array, mode: SplitMode): Promise<SplitPart[]> {
  const pageCount = (await loadPdf(bytes)).getPageCount();
  return extractGroups(bytes, planSplit(mode, pageCount));
}
