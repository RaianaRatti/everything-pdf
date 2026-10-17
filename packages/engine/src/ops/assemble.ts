import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  PDFPage,
  PDFRef,
  PDFString,
  degrees,
} from "pdf-lib";
import { PdfEngineError } from "../errors";
import { destinationPage, writeOutline, type Bookmark } from "../outline";
import { normalizeRotation } from "../geometry";
import { loadPdf } from "../load";
import { stripMetadata, writeInfo } from "../metadata";
import type { DocInfo } from "../presets";

/** One page of an output document: which source file, which page, and extra rotation. */
export interface PageRef {
  source: string;
  pageIndex: number;
  /** Additional clockwise rotation in degrees (multiple of 90), on top of the page's own. */
  rotation?: number;
}

export interface AssembleOptions {
  /**
   * Document properties for the output. `null` removes all metadata (no Info dictionary, no
   * XMP). Leave out for pdf-lib's defaults.
   */
  info?: DocInfo | null;
  /** Bookmarks for the output; `pageIndex` refers to positions in `pages`. */
  outline?: Bookmark[];
}

/**
 * Builds a new PDF from pages of one or more source PDFs, in the given order. This is the
 * primitive behind merge, reorder, delete, duplicate, rotate and extract.
 */
export async function assemble(
  sources: Record<string, Uint8Array>,
  pages: PageRef[],
  options: AssembleOptions = {},
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new PdfEngineError("bad-input", "There are no pages to save.");
  }

  const out = await PDFDocument.create({ updateMetadata: options.info === undefined });
  const formSources: PDFDocument[] = [];

  // Copy each source's pages in one call so shared resources (fonts, images) are copied once.
  const needed = new Map<string, number[]>();
  for (const ref of pages) {
    const list = needed.get(ref.source) ?? [];
    list.push(ref.pageIndex);
    needed.set(ref.source, list);
  }

  const copied = new Map<string, Map<number, ReturnType<PDFDocument["getPage"]>>>();
  for (const [source, indices] of needed) {
    const bytes = sources[source];
    if (!bytes) throw new PdfEngineError("bad-input", `Unknown source file "${source}".`);
    const doc = await loadPdf(bytes);
    if (doc.catalog.has(PDFName.of("AcroForm"))) formSources.push(doc);
    detachLinkTargets(doc, source);
    const unique = [...new Set(indices)];
    for (const i of unique) {
      if (i < 0 || i >= doc.getPageCount()) {
        throw new PdfEngineError("bad-input", `Page ${i + 1} doesn't exist in "${source}".`);
      }
    }
    const copiedPages = await out.copyPages(doc, unique);
    copied.set(source, new Map(unique.map((i, k) => [i, copiedPages[k]!])));
  }

  // The same source page can appear more than once (duplicates). Each occurrence needs its own
  // page object, but a shallow clone shares content streams and resources instead of copying them.
  const used = new Set<PDFPage>();
  for (const ref of pages) {
    let page = copied.get(ref.source)!.get(ref.pageIndex)!;
    if (used.has(page)) {
      const node = page.node.clone(out.context);
      page = PDFPage.of(node, out.context.register(node), out);
    }
    used.add(page);
    out.addPage(page);
    if (ref.rotation) {
      page.setRotation(degrees(normalizeRotation(page.getRotation().angle + ref.rotation)));
    }
  }

  reattachLinkTargets(out, pages);
  if (formSources.length > 0) rebuildForm(out, formSources);
  if (options.outline) writeOutline(out, options.outline);
  if (options.info === null) stripMetadata(out);
  else if (options.info) writeInfo(out, options.info);

  return out.save({ useObjectStreams: true });
}

const AcroForm = PDFName.of("AcroForm");
const Annots = PDFName.of("Annots");
const Parent = PDFName.of("Parent");
const Subtype = PDFName.of("Subtype");
const Widget = PDFName.of("Widget");

/**
 * Copied pages keep their form widgets (and, through /Parent, the fields behind them), but the
 * list of fields lives in the source's catalog, which isn't copied. Rebuild it from the widgets
 * so forms stay fillable, and carry over the default appearance settings.
 */
function rebuildForm(out: PDFDocument, sources: PDFDocument[]): void {
  const { context } = out;
  const fields = new Set<PDFRef>();
  for (const page of out.getPages()) {
    const annots = page.node.lookupMaybe(Annots, PDFArray);
    for (const ref of annots?.asArray() ?? []) {
      if (!(ref instanceof PDFRef)) continue;
      const annot = context.lookupMaybe(ref, PDFDict);
      if (annot?.get(Subtype) !== Widget) continue;
      // Walk up to the top-level field.
      let top = ref;
      for (let parent = annot.get(Parent); parent instanceof PDFRef;) {
        top = parent;
        parent = context.lookupMaybe(parent, PDFDict)?.get(Parent);
      }
      fields.add(top);
    }
  }
  if (fields.size === 0) return;

  const form = context.obj({}) as PDFDict;
  const source = sources[0]!;
  const original = source.catalog.lookupMaybe(AcroForm, PDFDict);
  if (original) {
    const copier = PDFObjectCopier.for(source.context, context);
    for (const key of ["DA", "DR", "Q", "NeedAppearances"]) {
      const value = original.get(PDFName.of(key));
      if (value) form.set(PDFName.of(key), copier.copy(value));
    }
  }
  form.set(PDFName.of("Fields"), context.obj([...fields]));
  out.catalog.set(AcroForm, context.register(form));
}

const Dest = PDFName.of("Dest");
const A = PDFName.of("A");
const LinkSource = PDFName.of("EPDFLinkSource");

/**
 * Links to other pages point at page objects. Copied as they are, they'd drag stray copies of
 * those pages into the output and lead nowhere. Swap each target for its page number (tagged
 * with the source) before copying; reattachLinkTargets points them at the output pages.
 */
function detachLinkTargets(doc: PDFDocument, source: string): void {
  const index = new Map(doc.getPages().map((p, i) => [p.ref, i]));
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(Annots, PDFArray);
    for (const ref of annots?.asArray() ?? []) {
      const annot = doc.context.lookupMaybe(ref, PDFDict);
      if (annot?.get(Subtype) !== PDFName.of("Link")) continue;
      const action = annot.lookupMaybe(A, PDFDict);
      if (action && action.get(PDFName.of("S")) !== PDFName.of("GoTo")) continue;
      const target = destinationPage(doc, annot.get(Dest) ?? annot.get(A));
      const pageIndex = target ? index.get(target) : undefined;
      if (pageIndex === undefined) continue;
      annot.delete(A);
      annot.set(Dest, doc.context.obj([PDFNumber.of(pageIndex), PDFName.of("Fit")]));
      annot.set(LinkSource, PDFString.of(source));
    }
  }
}

function reattachLinkTargets(out: PDFDocument, refs: PageRef[]): void {
  const outPages = out.getPages();
  // First output page showing each source page.
  const target = new Map<string, PDFRef>();
  refs.forEach((r, i) => {
    const key = `${r.source}:${r.pageIndex}`;
    if (!target.has(key)) target.set(key, outPages[i]!.ref);
  });
  for (const page of outPages) {
    const annots = page.node.lookupMaybe(Annots, PDFArray);
    if (!annots) continue;
    const kept = annots.asArray().filter((ref) => {
      const annot = out.context.lookupMaybe(ref, PDFDict);
      const source = annot?.get(LinkSource);
      if (!annot || !(source instanceof PDFString)) return true;
      annot.delete(LinkSource);
      const dest = annot.lookupMaybe(Dest, PDFArray);
      const index = dest?.get(0);
      const ref2 =
        index instanceof PDFNumber
          ? target.get(`${source.decodeText()}:${index.asNumber()}`)
          : undefined;
      if (!ref2) return false; // the page it led to isn't in the output: drop the dead link
      annot.set(Dest, out.context.obj([ref2, PDFName.of("Fit")]));
      return true;
    });
    page.node.set(Annots, out.context.obj(kept));
  }
}
