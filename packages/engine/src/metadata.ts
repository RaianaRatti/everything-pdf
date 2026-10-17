import { PDFDict, PDFName, PDFStream, type PDFDocument } from "pdf-lib";
import { removeUnreferencedObjects } from "./ops/compress";
import type { DocInfo } from "./presets";

export interface FullDocInfo extends DocInfo {
  creator: string;
  producer: string;
  /** ISO 8601, or "" if unknown. */
  created: string;
  modified: string;
}

const iso = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");

/** Reads the Info dictionary. Missing or unreadable entries come back as "". */
export function readInfo(doc: PDFDocument): FullDocInfo {
  const get = <T>(read: () => T | undefined): T | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  return {
    title: get(() => doc.getTitle()) ?? "",
    author: get(() => doc.getAuthor()) ?? "",
    subject: get(() => doc.getSubject()) ?? "",
    keywords: get(() => doc.getKeywords()) ?? "",
    creator: get(() => doc.getCreator()) ?? "",
    producer: get(() => doc.getProducer()) ?? "",
    created: iso(get(() => doc.getCreationDate())),
    modified: iso(get(() => doc.getModificationDate())),
  };
}

/** Writes document properties, leaving out empty ones. */
export function writeInfo(doc: PDFDocument, info: DocInfo): void {
  if (info.title.trim()) doc.setTitle(info.title.trim());
  if (info.author.trim()) doc.setAuthor(info.author.trim());
  if (info.subject.trim()) doc.setSubject(info.subject.trim());
  const keywords = info.keywords
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (keywords.length) doc.setKeywords(keywords);
  doc.setProducer("Everything PDF");
  const now = new Date();
  doc.setCreationDate(now);
  doc.setModificationDate(now);
}

const STRIPPED = ["Metadata", "PieceInfo", "LastModified"].map((n) => PDFName.of(n));

/**
 * Removes every trace of metadata: the Info dictionary, XMP streams on the catalog, pages and
 * images, and application data (PieceInfo). Page content is untouched.
 */
export function stripMetadata(doc: PDFDocument): void {
  delete doc.context.trailerInfo.Info;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    for (const name of STRIPPED) dict.delete(name);
  }
  // Document-level identifiers can tie a file back to the software or session that made it.
  delete doc.context.trailerInfo.ID;
  removeUnreferencedObjects(doc);
}

/** True if any XMP or Info metadata remains (used by tests and the inspector). */
export function hasMetadata(doc: PDFDocument): boolean {
  if (doc.context.trailerInfo.Info) return true;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (dict && STRIPPED.some((n) => dict.has(n))) return true;
  }
  return false;
}
