import { PDFArray, PDFDict, PDFName, PDFStream, type PDFDocument } from "pdf-lib";
import { visualFrame } from "../geometry";
import { loadPdf } from "../load";
import { hasMetadata, readInfo, type FullDocInfo } from "../metadata";
import { formFieldCount } from "./forms";

export interface PdfDetails {
  pageCount: number;
  /** e.g. "1.7" */
  version: string;
  info: FullDocInfo;
  hasMetadata: boolean;
  /** Distinct displayed page sizes in points, most common first. */
  pageSizes: { width: number; height: number; count: number }[];
  fonts: string[];
  imageCount: number;
  /** Annotation counts by type, e.g. { Link: 3, Highlight: 1 }. */
  annotations: Record<string, number>;
  formFields: number;
  attachments: number;
  hasJavaScript: boolean;
}

const name = (n: string) => PDFName.of(n);

/** A read-only summary of what's inside a PDF, for the inspector. */
export async function inspectDetails(bytes: Uint8Array): Promise<PdfDetails> {
  const doc = await loadPdf(bytes);

  const sizes = new Map<string, { width: number; height: number; count: number }>();
  const annotations: Record<string, number> = {};
  for (const page of doc.getPages()) {
    const frame = visualFrame(page);
    const [w, h] = [Math.round(frame.width), Math.round(frame.height)];
    const entry = sizes.get(`${w}x${h}`) ?? { width: w, height: h, count: 0 };
    entry.count++;
    sizes.set(`${w}x${h}`, entry);

    const annots = page.node.lookupMaybe(name("Annots"), PDFArray);
    for (const ref of annots?.asArray() ?? []) {
      const subtype = doc.context.lookupMaybe(ref, PDFDict)?.get(name("Subtype"));
      const key = subtype?.toString().slice(1) ?? "Unknown";
      if (key === "Popup") continue; // part of another annotation
      annotations[key] = (annotations[key] ?? 0) + 1;
    }
  }

  const fonts = new Set<string>();
  let imageCount = 0;
  let attachments = 0;
  let hasJavaScript = false;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    const type = dict.get(name("Type"))?.toString();
    const subtype = dict.get(name("Subtype"))?.toString();
    if (type === "/Font") {
      const base = dict.get(name("BaseFont"))?.toString().slice(1);
      // Subset fonts are named like ABCDEF+Helvetica.
      if (base) fonts.add(base.replace(/^[A-Z]{6}\+/, ""));
    }
    if (subtype === "/Image") imageCount++;
    if (type === "/EmbeddedFile") attachments++;
    if (dict.has(name("JS")) || dict.get(name("S"))?.toString() === "/JavaScript") {
      hasJavaScript = true;
    }
  }

  return {
    pageCount: doc.getPageCount(),
    version: pdfVersion(doc),
    info: readInfo(doc),
    hasMetadata: hasMetadata(doc),
    pageSizes: [...sizes.values()].sort((a, b) => b.count - a.count),
    fonts: [...fonts].sort(),
    imageCount,
    annotations,
    formFields: formFieldCount(doc),
    attachments,
    hasJavaScript,
  };
}

function pdfVersion(doc: PDFDocument): string {
  const catalogVersion = doc.catalog.get(name("Version"))?.toString().slice(1);
  const header = /%PDF-(\d\.\d)/.exec(doc.context.header.toString())?.[1] ?? "1.7";
  // The catalog can raise the version declared in the header.
  return catalogVersion && catalogVersion > header ? catalogVersion : header;
}
