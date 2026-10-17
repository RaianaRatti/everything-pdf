import { loadPdf } from "../load";
import { assemble, type PageRef } from "./assemble";

/** Concatenates PDFs in order. */
export async function merge(files: Uint8Array[]): Promise<Uint8Array> {
  const sources: Record<string, Uint8Array> = {};
  const pages: PageRef[] = [];
  for (const [i, bytes] of files.entries()) {
    const source = String(i);
    sources[source] = bytes;
    const count = (await loadPdf(bytes)).getPageCount();
    for (let p = 0; p < count; p++) pages.push({ source, pageIndex: p });
  }
  return assemble(sources, pages);
}
