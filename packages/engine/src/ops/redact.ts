import { PDFArray, PDFDict, PDFName, PDFRef } from "pdf-lib";
import { loadPdf } from "../load";
import { removeUnreferencedObjects } from "./compress";
import { replacePagesWithImages, type PageImage } from "./images";
import { addTextLayer, type OcrWord } from "./textLayer";

export interface RedactedPage extends PageImage {
  /** Text that wasn't redacted, so the page stays searchable. */
  words: OcrWord[];
}

/**
 * Applies redactions that were burned into page images: each page is replaced by its image
 * (so nothing under the black boxes survives), the remaining text goes back as an invisible
 * layer, and every object only the old pages used is deleted from the file, including form
 * fields whose widgets were on those pages.
 */
export async function redactPages(bytes: Uint8Array, pages: RedactedPage[]): Promise<Uint8Array> {
  const replaced = await replacePagesWithImages(bytes, pages);
  const layered = await addTextLayer(
    replaced,
    pages.map((p) => ({ pageIndex: p.pageIndex, words: p.words })),
  );
  const doc = await loadPdf(layered);
  pruneOrphanFields(doc);
  removeUnreferencedObjects(doc);
  return doc.save({ useObjectStreams: true });
}

/** Drops form fields that no longer have a widget on any page. */
function pruneOrphanFields(doc: Awaited<ReturnType<typeof loadPdf>>): void {
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  const fields = form?.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (!form || !fields) return;
  const onPages = new Set<PDFRef>();
  for (const page of doc.getPages()) {
    for (const ref of page.node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? []) {
      if (ref instanceof PDFRef) onPages.add(ref);
    }
  }
  const hasWidget = (ref: PDFRef, depth = 0): boolean => {
    if (onPages.has(ref) || depth > 20) return onPages.has(ref);
    const kids = doc.context.lookupMaybe(ref, PDFDict)?.lookupMaybe(PDFName.of("Kids"), PDFArray);
    return kids?.asArray().some((k) => k instanceof PDFRef && hasWidget(k, depth + 1)) ?? false;
  };
  const kept = fields.asArray().filter((f) => f instanceof PDFRef && hasWidget(f));
  if (kept.length) form.set(PDFName.of("Fields"), doc.context.obj(kept));
  else doc.catalog.delete(PDFName.of("AcroForm"));
}
