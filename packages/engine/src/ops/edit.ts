import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  degrees,
  rgb,
  type PDFDocument,
  type PDFPage,
} from "pdf-lib";
import { PdfEngineError } from "../errors";
import { visualFrame, visualToPage } from "../geometry";
import { loadPdf } from "../load";
import { assertDrawable, embedFamily, type FontFamily } from "../text";
import { embedImage, type ImageInput } from "./images";

/** 0–1 RGB. */
export type Color = [number, number, number];

/** A box as fractions of the page as displayed, origin top-left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EditObject =
  | {
      kind: "text";
      box: Box;
      text: string;
      /** In points. */
      fontSize: number;
      font: FontFamily;
      bold?: boolean;
      color: Color;
    }
  | { kind: "image"; box: Box; image: ImageInput }
  /** An opaque rectangle. It hides what's underneath but doesn't remove it (that's redaction). */
  | { kind: "whiteout"; box: Box; color: Color }
  /** A real highlight annotation, so other PDF apps list it as a comment. */
  | { kind: "highlight"; box: Box; color: Color; comment?: string }
  /** A sticky note; only the box's top-left corner is used. */
  | { kind: "note"; box: Box; text: string; color: Color }
  /** A clickable area that opens a web address or jumps to a page (0-based). */
  | { kind: "link"; box: Box; url?: string; pageIndex?: number }
  /** A new fillable form field. Names must be unique; a number is added if one is taken. */
  | {
      kind: "field";
      box: Box;
      field: "text" | "multiline" | "checkbox" | "dropdown";
      name: string;
      options?: string[];
    };

export interface PageEdits {
  pageIndex: number;
  objects: EditObject[];
}

/** Draws text, images, whiteout boxes, highlights and notes onto pages. */
export async function applyEdits(bytes: Uint8Array, edits: PageEdits[]): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  for (const { pageIndex, objects } of edits) {
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
      throw new PdfEngineError("bad-input", `Page ${pageIndex + 1} doesn't exist.`);
    }
    const page = doc.getPage(pageIndex);
    for (const object of objects) await applyObject(doc, page, object);
  }
  return doc.save({ useObjectStreams: true });
}

/** Converts a visual box to an axis-aligned rectangle in page space. */
function pageRect(page: PDFPage, box: Box) {
  const frame = visualFrame(page);
  const a = visualToPage(page, box.x * frame.width, (1 - box.y) * frame.height);
  const b = visualToPage(
    page,
    (box.x + box.width) * frame.width,
    (1 - box.y - box.height) * frame.height,
  );
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Where to draw something box-shaped so it appears upright in the box, as displayed. */
function uprightOrigin(page: PDFPage, box: Box) {
  const frame = visualFrame(page);
  const width = box.width * frame.width;
  const height = box.height * frame.height;
  const vy = (1 - box.y - box.height) * frame.height;
  return { ...visualToPage(page, box.x * frame.width, vy), width, height, frame };
}

async function applyObject(doc: PDFDocument, page: PDFPage, object: EditObject): Promise<void> {
  switch (object.kind) {
    case "whiteout": {
      const r = pageRect(page, object.box);
      page.drawRectangle({ ...r, color: rgb(...object.color), borderWidth: 0 });
      return;
    }
    case "image": {
      const image = await embedImage(doc, object.image);
      const { x, y, width, height, frame } = uprightOrigin(page, object.box);
      page.drawImage(image, { x, y, width, height, rotate: degrees(frame.rotation) });
      return;
    }
    case "text":
      return drawTextBlock(doc, page, object);
    case "highlight":
      return addHighlight(doc, page, object);
    case "note":
      return addNote(doc, page, object);
    case "link":
      return addLink(doc, page, object);
    case "field":
      return addField(doc, page, object);
  }
}

function addLink(
  doc: PDFDocument,
  page: PDFPage,
  object: Extract<EditObject, { kind: "link" }>,
): void {
  const r = pageRect(page, object.box);
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [r.x, r.y, r.x + r.width, r.y + r.height].map(num),
    Border: [0, 0, 0],
    F: 4,
    P: page.ref,
  }) as PDFDict;
  if (object.url) {
    const url = /^[a-z][a-z0-9+.-]*:/i.test(object.url) ? object.url : `https://${object.url}`;
    annot.set(PDFName.of("A"), doc.context.obj({ S: "URI", URI: PDFString.of(url) }));
  } else if (object.pageIndex !== undefined) {
    if (object.pageIndex < 0 || object.pageIndex >= doc.getPageCount()) {
      throw new PdfEngineError("bad-input", `Page ${object.pageIndex + 1} doesn't exist.`);
    }
    annot.set(
      PDFName.of("Dest"),
      doc.context.obj([doc.getPage(object.pageIndex).ref, PDFName.of("Fit")]),
    );
  } else {
    throw new PdfEngineError("bad-input", "A link needs a web address or a page.");
  }
  addAnnotation(doc, page, annot);
}

function addField(
  doc: PDFDocument,
  page: PDFPage,
  object: Extract<EditObject, { kind: "field" }>,
): void {
  const form = doc.getForm();
  const base = object.name.trim().replace(/\./g, "_") || "field";
  let name = base;
  for (let i = 2; form.getFieldMaybe(name); i++) name = `${base}_${i}`;
  const r = pageRect(page, object.box);
  const frame = visualFrame(page);
  const placement = { ...r, rotate: degrees(frame.rotation), borderWidth: 1 };
  switch (object.field) {
    case "text":
    case "multiline": {
      const field = form.createTextField(name);
      if (object.field === "multiline") field.enableMultiline();
      field.addToPage(page, placement);
      break;
    }
    case "checkbox":
      form.createCheckBox(name).addToPage(page, placement);
      break;
    case "dropdown": {
      const field = form.createDropdown(name);
      const options = (object.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        throw new PdfEngineError("bad-input", `The dropdown “${name}” needs at least one option.`);
      }
      field.addOptions(options);
      field.addToPage(page, placement);
      break;
    }
  }
}

async function drawTextBlock(
  doc: PDFDocument,
  page: PDFPage,
  object: Extract<EditObject, { kind: "text" }>,
): Promise<void> {
  const font = await embedFamily(doc, object.font, object.bold);
  const text = object.text.replace(/\r\n?/g, "\n");
  assertDrawable(font, text.replace(/\n/g, ""));
  const frame = visualFrame(page);
  const size = object.fontSize;
  const lineHeight = size * 1.2;
  const ascent = font.heightAtSize(size, { descender: false });
  const left = object.box.x * frame.width;
  const top = (1 - object.box.y) * frame.height;

  text.split("\n").forEach((line, i) => {
    if (!line) return;
    const { x, y } = visualToPage(page, left, top - ascent - i * lineHeight);
    page.drawText(line, {
      x,
      y,
      size,
      font,
      color: rgb(...object.color),
      rotate: degrees(frame.rotation),
    });
  });
}

/** Adds an annotation dictionary to the page's /Annots. */
function addAnnotation(doc: PDFDocument, page: PDFPage, annot: PDFDict): void {
  const ref = doc.context.register(annot);
  const key = PDFName.of("Annots");
  const existing = page.node.lookupMaybe(key, PDFArray);
  if (existing) existing.push(ref);
  else page.node.set(key, doc.context.obj([ref]));
}

const num = (n: number) => PDFNumber.of(Math.round(n * 1000) / 1000);

function addHighlight(
  doc: PDFDocument,
  page: PDFPage,
  object: Extract<EditObject, { kind: "highlight" }>,
): void {
  const { context } = doc;
  const r = pageRect(page, object.box);
  const [x1, y1, x2, y2] = [r.x, r.y, r.x + r.width, r.y + r.height];

  // An explicit appearance, so every viewer draws it the same: color multiplied onto the page.
  const appearance = context.stream(
    `/GS0 gs ${object.color.join(" ")} rg 0 0 ${r.width.toFixed(3)} ${r.height.toFixed(3)} re f`,
    {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, r.width, r.height],
      Resources: { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply", ca: 0.6 } } },
    },
  );

  const annot = context.obj({
    Type: "Annot",
    Subtype: "Highlight",
    Rect: [x1, y1, x2, y2].map(num),
    // Corners in the order viewers expect: top-left, top-right, bottom-left, bottom-right.
    QuadPoints: [x1, y2, x2, y2, x1, y1, x2, y1].map(num),
    C: object.color,
    CA: 0.6,
    F: 4, // Print
    P: page.ref,
    AP: { N: context.register(appearance) },
  }) as PDFDict;
  if (object.comment) annot.set(PDFName.of("Contents"), PDFHexString.fromText(object.comment));
  addAnnotation(doc, page, annot);
}

function addNote(
  doc: PDFDocument,
  page: PDFPage,
  object: Extract<EditObject, { kind: "note" }>,
): void {
  const frame = visualFrame(page);
  const { x, y } = visualToPage(
    page,
    object.box.x * frame.width,
    (1 - object.box.y) * frame.height,
  );
  // Viewers draw the note icon themselves, upright and at a fixed size (NoRotate + NoZoom).
  const size = 20;
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [x, y - size, x + size, y].map(num),
    Name: "Comment",
    C: object.color,
    F: 4 | 8 | 16,
    P: page.ref,
    Open: false,
  }) as PDFDict;
  annot.set(PDFName.of("Contents"), PDFHexString.fromText(object.text));
  annot.set(PDFName.of("M"), PDFString.fromDate(new Date()));
  addAnnotation(doc, page, annot);
}
