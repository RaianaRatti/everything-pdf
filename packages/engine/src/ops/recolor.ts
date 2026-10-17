import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";
import { binaryToBytes, bytesToBinary, fmt, parseContent, splice, type Operand } from "../content";
import { loadPdf } from "../load";

export interface RecolorOptions {
  /**
   * "invert": a true negative (white → black, red → cyan).
   * "smart": dark mode that keeps hues (red stays red) and softens contrast a little.
   */
  mode: "invert" | "smart";
  /** Leave photos and other images as they are (the usual choice for dark mode). */
  keepImages: boolean;
  /** 0-based pages to change; all when omitted. */
  pages?: number[];
}

type Rgb = [number, number, number];

/** Maps a color for the chosen mode. */
function mapper(mode: RecolorOptions["mode"]): (c: Rgb) => Rgb {
  if (mode === "invert") return ([r, g, b]) => [1 - r, 1 - g, 1 - b];
  // Invert lightness in HSL, keep hue and saturation. White → near-black, black → light gray.
  return ([r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const target = 0.93 - 0.86 * l;
    if (max === min) return [target, target, target];
    // Scale the color's distance from its own lightness to the new lightness.
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const newD = s * (target > 0.5 ? 2 - 2 * target : 2 * target);
    const k = newD / d;
    return [target + (r - l) * k, target + (g - l) * k, target + (b - l) * k].map((v) =>
      Math.min(1, Math.max(0, v)),
    ) as Rgb;
  };
}

const cmykToRgb = (c: number, m: number, y: number, k: number): Rgb => [
  (1 - c) * (1 - k),
  (1 - m) * (1 - k),
  (1 - y) * (1 - k),
];
const gray = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;

/** What we know about a color space: how many components, or that we leave it alone. */
type SpaceKind = "gray" | "rgb" | "cmyk" | "other";

const n = (s: string) => PDFName.of(s);

function spaceKind(context: PDFContext, value: PDFObject | undefined): SpaceKind {
  const cs = context.lookup(value);
  if (cs instanceof PDFName) {
    const name = cs.asString();
    if (name === "/DeviceGray" || name === "/G" || name === "/CalGray") return "gray";
    if (name === "/DeviceRGB" || name === "/RGB" || name === "/CalRGB") return "rgb";
    if (name === "/DeviceCMYK" || name === "/CMYK") return "cmyk";
    return "other";
  }
  if (cs instanceof PDFArray) {
    const family = cs.get(0)?.toString();
    if (family === "/CalGray") return "gray";
    if (family === "/CalRGB") return "rgb";
    if (family === "/ICCBased") {
      const profile = context.lookupMaybe(cs.get(1), PDFStream);
      const comps = profile?.dict.get(n("N"));
      const count = comps instanceof PDFNumber ? comps.asNumber() : 0;
      return count === 1 ? "gray" : count === 3 ? "rgb" : count === 4 ? "cmyk" : "other";
    }
  }
  return "other";
}

/** Resolves a color space operand (a resource name or a device name) for cs/CS. */
function resolveSpace(
  context: PDFContext,
  resources: PDFDict | undefined,
  name: string,
): SpaceKind {
  const device = spaceKind(context, n(name));
  if (device !== "other") return device;
  const spaces = resources?.lookupMaybe(n("ColorSpace"), PDFDict);
  return spaces ? spaceKind(context, spaces.get(n(name))) : "other";
}

interface Recolorer {
  context: PDFContext;
  map: (c: Rgb) => Rgb;
  keepImages: boolean;
  visited: Set<PDFRef>;
}

/** Rewrites every color in a content stream. Returns the new stream text. */
function recolorContent(r: Recolorer, s: string, resources: PDFDict | undefined): string {
  const { map } = r;
  const black = map([0, 0, 0]);
  const edits: { start: number; end: number; text: string }[] = [];
  // Current color space kind for fill and stroke; q/Q save and restore them.
  let fill: SpaceKind = "gray";
  let stroke: SpaceKind = "gray";
  const stack: [SpaceKind, SpaceKind][] = [];

  const nums = (ops: Operand[]) =>
    ops.every((o) => o.type === "number") ? ops.map((o) => (o as { value: number }).value) : null;
  const colorText = (rgb: Rgb, kind: "gray" | "rgb", op: string) =>
    kind === "gray" ? `${fmt(gray(rgb))} ${op}` : `${rgb.map(fmt).join(" ")} ${op}`;

  for (const op of parseContent(s)) {
    const values = nums(op.operands);
    const replace = (text: string) => edits.push({ start: op.start, end: op.end, text });
    switch (op.operator) {
      case "q":
        stack.push([fill, stroke]);
        break;
      case "Q":
        [fill, stroke] = stack.pop() ?? ["gray", "gray"];
        break;
      case "g":
      case "G": {
        if (values?.length !== 1) break;
        const v = values[0]!;
        replace(colorText(map([v, v, v]), "gray", op.operator));
        if (op.operator === "g") fill = "gray";
        else stroke = "gray";
        break;
      }
      case "rg":
      case "RG": {
        if (values?.length !== 3) break;
        replace(colorText(map(values as Rgb), "rgb", op.operator));
        if (op.operator === "rg") fill = "rgb";
        else stroke = "rgb";
        break;
      }
      case "k":
      case "K": {
        if (values?.length !== 4) break;
        const [c, m, y, k] = values as [number, number, number, number];
        // Becomes an RGB color: there's no inverse in CMYK that matches what screens show.
        replace(colorText(map(cmykToRgb(c, m, y, k)), "rgb", op.operator === "k" ? "rg" : "RG"));
        if (op.operator === "k") fill = "rgb";
        else stroke = "rgb";
        break;
      }
      case "cs":
      case "CS": {
        const name = op.operands[0];
        if (name?.type !== "name") break;
        const kind = resolveSpace(r.context, resources, name.value);
        const setOp = op.operator === "cs" ? "sc" : "SC";
        // Selecting a color space resets the color to black, which must become the mapped black.
        if (kind === "gray" || kind === "rgb") {
          edits.push({ start: op.end, end: op.end, text: ` ${colorText(black, kind, setOp)}` });
        } else if (kind === "cmyk") {
          replace(`/DeviceRGB ${op.operator} ${colorText(black, "rgb", setOp)}`);
        }
        const tracked: SpaceKind = kind === "cmyk" ? "cmyk" : kind;
        if (op.operator === "cs") fill = tracked;
        else stroke = tracked;
        break;
      }
      case "sc":
      case "scn":
      case "SC":
      case "SCN": {
        const kind = op.operator[0] === "s" ? fill : stroke;
        if (!values) break; // pattern colors end with a name: left alone
        if (kind === "gray" && values.length === 1) {
          const v = values[0]!;
          replace(colorText(map([v, v, v]), "gray", op.operator));
        } else if (kind === "rgb" && values.length === 3) {
          replace(colorText(map(values as Rgb), "rgb", op.operator));
        } else if (kind === "cmyk" && values.length === 4) {
          const [c, m, y, k] = values as [number, number, number, number];
          replace(colorText(map(cmykToRgb(c, m, y, k)), "rgb", op.operator));
        }
        break;
      }
      case "BI": {
        if (r.keepImages || op.dataStart === undefined) break;
        const dict = s.slice(op.start + 2, op.dataStart);
        if (/\/(IM|ImageMask)\s+true/.test(dict) || /\/(D|Decode)[\s[]/.test(dict)) break;
        const cs = /\/(CS|ColorSpace)\s*\/(\w+)/.exec(dict)?.[2];
        const comps =
          cs === "G" || cs === "DeviceGray" ? 1 : cs === "RGB" || cs === "DeviceRGB" ? 3 : 0;
        if (!comps) break;
        const decode = Array.from({ length: comps }, () => "1 0").join(" ");
        edits.push({ start: op.start + 2, end: op.start + 2, text: ` /D [${decode}]` });
        break;
      }
      case "Do": {
        const name = op.operands[0];
        if (name?.type === "name") recolorXObject(r, resources, name.value);
        break;
      }
    }
  }
  return splice(s, edits);
}

/** Recolors a form XObject's content, or inverts an image, once per object. */
function recolorXObject(r: Recolorer, resources: PDFDict | undefined, name: string): void {
  const xobjects = resources?.lookupMaybe(n("XObject"), PDFDict);
  const ref = xobjects?.get(n(name));
  if (!(ref instanceof PDFRef) || r.visited.has(ref)) return;
  r.visited.add(ref);
  const stream = r.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return;
  const subtype = stream.dict.get(n("Subtype"));

  if (subtype === n("Form")) {
    const own = stream.dict.lookupMaybe(n("Resources"), PDFDict) ?? resources;
    let content: string;
    try {
      content = bytesToBinary(decodePDFRawStream(stream).decode());
    } catch {
      return;
    }
    const next = r.context.flateStream(binaryToBytes(recolorContent(r, content, own)));
    for (const [key, value] of stream.dict.entries()) {
      if (!["/Filter", "/DecodeParms", "/Length"].includes(key.asString()))
        next.dict.set(key, value);
    }
    r.context.assign(ref, next);
  } else if (subtype === n("Image") && !r.keepImages) {
    invertImage(r.context, stream.dict);
  }
}

/** Inverts an image without decoding it: flip its Decode ranges, or its palette. */
function invertImage(context: PDFContext, dict: PDFDict): void {
  if (dict.get(n("ImageMask"))?.toString() === "true") return; // painted with the fill color
  const csValue = dict.get(n("ColorSpace"));
  const kind = spaceKind(context, csValue);
  if (kind === "gray" || kind === "rgb") {
    const comps = kind === "gray" ? 1 : 3;
    const existing = context.lookupMaybe(dict.get(n("Decode")), PDFArray);
    const ranges = existing
      ? existing.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : 0))
      : Array.from({ length: comps * 2 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const flipped: number[] = [];
    for (let i = 0; i < ranges.length; i += 2) flipped.push(ranges[i + 1]!, ranges[i]!);
    dict.set(n("Decode"), context.obj(flipped));
    return;
  }
  // Indexed (palette) images: invert the palette's colors.
  const cs = context.lookup(csValue);
  if (cs instanceof PDFArray && cs.get(0)?.toString() === "/Indexed") {
    const base = spaceKind(context, cs.get(1));
    if (base !== "gray" && base !== "rgb") return;
    const table = context.lookup(cs.get(3));
    let bytes: Uint8Array | null = null;
    if (table instanceof PDFString || table instanceof PDFHexString) bytes = table.asBytes();
    else if (table instanceof PDFRawStream) {
      try {
        bytes = decodePDFRawStream(table).decode();
      } catch {
        return;
      }
    }
    if (!bytes) return;
    const inverted = Array.from(bytes, (b) => (255 - b).toString(16).padStart(2, "0")).join("");
    const next = context.obj([cs.get(0)!, cs.get(1)!, cs.get(2)!, PDFHexString.of(inverted)]);
    dict.set(n("ColorSpace"), next);
  }
  // CMYK and other images are left alone: flipping CMYK channels isn't a screen negative.
}

/**
 * Dark mode that keeps text as text: rewrites every color in the pages' drawing instructions
 * and puts a dark background behind them. Works on vector content; gradients and spot colors
 * are left as they are.
 */
export async function recolorPdf(bytes: Uint8Array, options: RecolorOptions): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const r: Recolorer = {
    context: doc.context,
    map: mapper(options.mode),
    keepImages: options.keepImages,
    visited: new Set(),
  };
  const targets = new Set(options.pages ?? doc.getPages().map((_, i) => i));
  doc.getPages().forEach((page, i) => {
    if (!targets.has(i)) return;
    recolorPage(doc, r, page);
  });
  return doc.save({ useObjectStreams: true });
}

function recolorPage(doc: PDFDocument, r: Recolorer, page: ReturnType<PDFDocument["getPage"]>) {
  const { context } = doc;
  const contents = page.node.get(n("Contents"));
  const streams: PDFRawStream[] = [];
  const resolved = context.lookup(contents);
  if (resolved instanceof PDFRawStream) streams.push(resolved);
  else if (resolved instanceof PDFArray) {
    for (const item of resolved.asArray()) {
      const s = context.lookup(item);
      if (s instanceof PDFRawStream) streams.push(s);
    }
  }
  // Streams can split an operation in two, so they're joined before reading.
  let content = "";
  for (const s of streams) {
    try {
      content += bytesToBinary(decodePDFRawStream(s).decode()) + "\n";
    } catch {
      // Unreadable stream: skip it.
    }
  }

  const resources = page.node.Resources();
  const recolored = recolorContent(r, content, resources);
  const { x, y, width, height } = page.getMediaBox();
  const background = r.map([1, 1, 1]).map(fmt).join(" ");
  const ink = r.map([0, 0, 0]).map(fmt).join(" ");
  // Dark sheet first, then the default (black) colors as their mapped versions.
  const prefix = `q ${background} rg ${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re f Q ${ink} rg ${ink} RG\n`;
  const stream = context.flateStream(binaryToBytes(`${prefix}q\n${recolored}\nQ`));
  page.node.set(n("Contents"), context.register(stream));
}
