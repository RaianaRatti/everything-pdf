import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { OPS, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))),
  );
}

export interface FixturePage {
  label: string;
  size?: [number, number];
  rotation?: number;
}

/** Makes a PDF whose pages each contain a label, so tests can check page order via text. */
export async function makePdf(pages: (string | FixturePage)[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const {
      label,
      size = [300, 400],
      rotation = 0,
    } = typeof spec === "string" ? { label: spec } : spec;
    const page = doc.addPage(size);
    page.drawText(label, { x: 40, y: size[1] / 2, size: 24, font });
    if (rotation) page.setRotation(degrees(rotation));
  }
  return doc.save();
}

export interface ReadPage {
  text: string;
  rotation: number;
  /** Size as displayed (after rotation). */
  width: number;
  height: number;
  items: { str: string; x: number; y: number }[];
}

/** Reads pages back with pdf.js — an independent parser — to verify engine output. */
export async function readPdf(bytes: Uint8Array): Promise<ReadPage[]> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const pages: ReadPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      // Convert to viewport (displayed, top-left origin) coordinates.
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      return [{ str: item.str, x: x!, y: y! }];
    });
    pages.push({
      text: items.map((i) => i.str).join(" "),
      rotation: page.rotate,
      width: viewport.width,
      height: viewport.height,
      items,
    });
  }
  await task.destroy();
  return pages;
}

export async function texts(bytes: Uint8Array): Promise<string[]> {
  return (await readPdf(bytes)).map((p) => p.text);
}

/**
 * Returns the bounding box of each image drawn on page 1, in displayed (viewport) coordinates
 * as fractions of the page size: { x, y, width, height } with origin top-left.
 */
export async function imageBoxes(
  bytes: Uint8Array,
): Promise<{ x: number; y: number; width: number; height: number }[]> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();

  type Matrix = number[];
  const multiply = (m: Matrix, n: Matrix): Matrix => [
    m[0]! * n[0]! + m[2]! * n[1]!,
    m[1]! * n[0]! + m[3]! * n[1]!,
    m[0]! * n[2]! + m[2]! * n[3]!,
    m[1]! * n[2]! + m[3]! * n[3]!,
    m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
    m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
  ];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const boxes: { x: number; y: number; width: number; height: number }[] = [];

  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix);
    else if (fn === OPS.paintImageXObject) {
      const corners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([u, v]) => {
        const px = ctm[0]! * u! + ctm[2]! * v! + ctm[4]!;
        const py = ctm[1]! * u! + ctm[3]! * v! + ctm[5]!;
        const [x, y] = viewport.convertToViewportPoint(px, py);
        return [x! / viewport.width, y! / viewport.height] as const;
      });
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      boxes.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      });
    }
  });
  await task.destroy();
  return boxes;
}

/** Annotations on each page, as pdf.js sees them. */
export async function annotations(
  bytes: Uint8Array,
): Promise<{ subtype: string; contents: string }[][]> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const annots = await (await pdf.getPage(i)).getAnnotations();
    pages.push(
      annots.map((a: { subtype: string; contentsObj?: { str: string } }) => ({
        subtype: a.subtype,
        contents: a.contentsObj?.str ?? "",
      })),
    );
  }
  await task.destroy();
  return pages;
}

/** A two-page PDF with a text field, checkbox, dropdown and radio group on page 1. */
export async function makeFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  doc.addPage([400, 400]);
  const form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 20, y: 340, width: 200, height: 24 });
  form.createCheckBox("agree").addToPage(page, { x: 20, y: 300, width: 16, height: 16 });
  const color = form.createDropdown("color");
  color.addOptions(["Red", "Green", "Blue"]);
  color.addToPage(page, { x: 20, y: 260, width: 120, height: 24 });
  const size = form.createRadioGroup("size");
  size.addOptionToPage("S", page, { x: 20, y: 220, width: 16, height: 16 });
  size.addOptionToPage("L", page, { x: 60, y: 220, width: 16, height: 16 });
  return doc.save();
}
