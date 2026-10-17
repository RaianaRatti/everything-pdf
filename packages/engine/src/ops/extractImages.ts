import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";
import { loadPdf } from "../load";
import { encodePng, unpredictPng } from "../png";

export interface ExtractedImage {
  /** 1-based number of the first page that shows the image. */
  page: number;
  ext: "jpg" | "png" | "jp2";
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface ExtractImagesResult {
  images: ExtractedImage[];
  /** Images in formats this can't decode yet (e.g. CMYK or JBIG2 scans). */
  skipped: number;
}

const n = (s: string) => PDFName.of(s);

/**
 * Pulls embedded images out of a PDF. JPEG and JPEG 2000 images come out byte-for-byte as
 * stored; other images are decoded and saved as PNG (with transparency when the PDF has it).
 * Each image appears once, however many pages use it.
 */
export async function extractImages(bytes: Uint8Array): Promise<ExtractImagesResult> {
  const doc = await loadPdf(bytes);
  const seen = new Set<PDFRef>();
  const images: ExtractedImage[] = [];
  let skipped = 0;

  doc.getPages().forEach((page, i) => {
    const resources = page.node.Resources();
    for (const ref of imageRefs(doc, resources, new Set())) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const stream = doc.context.lookup(ref);
      const image = stream instanceof PDFRawStream ? convert(doc, stream) : null;
      if (image) images.push({ page: i + 1, ...image });
      else skipped++;
    }
  });
  return { images, skipped };
}

/** Image XObjects used by a resource dictionary, including inside form XObjects. */
function imageRefs(
  doc: PDFDocument,
  resources: PDFDict | undefined,
  visited: Set<PDFRef>,
): PDFRef[] {
  const xobjects = resources?.lookupMaybe(n("XObject"), PDFDict);
  if (!xobjects) return [];
  const refs: PDFRef[] = [];
  for (const [, value] of xobjects.entries()) {
    if (!(value instanceof PDFRef) || visited.has(value)) continue;
    visited.add(value);
    const stream = doc.context.lookup(value);
    if (!(stream instanceof PDFStream)) continue;
    const subtype = stream.dict.get(n("Subtype"));
    if (subtype === n("Image") && !isMask(stream.dict)) refs.push(value);
    else if (subtype === n("Form")) {
      refs.push(...imageRefs(doc, stream.dict.lookupMaybe(n("Resources"), PDFDict), visited));
    }
  }
  return refs;
}

function isMask(dict: PDFDict): boolean {
  const mask = dict.get(n("ImageMask"));
  return mask?.toString() === "true";
}

function filters(dict: PDFDict): string[] {
  const f = dict.get(n("Filter"));
  if (f instanceof PDFName) return [f.asString()];
  if (f instanceof PDFArray) return f.asArray().map((x) => x.toString());
  return [];
}

const numberOf = (obj: PDFObject | undefined) =>
  obj instanceof PDFNumber ? obj.asNumber() : undefined;

function convert(doc: PDFDocument, stream: PDFRawStream): Omit<ExtractedImage, "page"> | null {
  const dict = stream.dict;
  const width = numberOf(dict.get(n("Width"))) ?? 0;
  const height = numberOf(dict.get(n("Height"))) ?? 0;
  if (!width || !height) return null;

  const f = filters(dict);
  if (f.length === 1 && f[0] === "/DCTDecode") {
    return { ext: "jpg", bytes: stream.contents, width, height };
  }
  if (f.length === 1 && f[0] === "/JPXDecode") {
    return { ext: "jp2", bytes: stream.contents, width, height };
  }

  const color = decodeSamples(doc, stream, width, height);
  if (!color) return null;
  let pixels = color.pixels;
  let channels: 1 | 2 | 3 | 4 = color.channels;

  // Soft mask = alpha channel, when it matches the image size.
  const smask = doc.context.lookup(dict.get(n("SMask")));
  if (smask instanceof PDFRawStream) {
    const alpha = decodeSamples(doc, smask, width, height);
    if (alpha && alpha.channels === 1) {
      const withAlpha = new Uint8Array(width * height * (channels + 1));
      for (let i = 0; i < width * height; i++) {
        withAlpha.set(pixels.subarray(i * channels, (i + 1) * channels), i * (channels + 1));
        withAlpha[i * (channels + 1) + channels] = alpha.pixels[i]!;
      }
      pixels = withAlpha;
      channels = channels === 1 ? 2 : 4;
    }
  }
  return { ext: "png", bytes: encodePng(pixels, width, height, channels), width, height };
}

/**
 * Decodes an image's samples to 8-bit gray or RGB. Handles Flate/LZW/uncompressed data with
 * PNG predictors, 1–8 bits per sample, gray/RGB/ICC and indexed color. Returns null otherwise.
 */
export function decodeSamples(
  doc: PDFDocument,
  stream: PDFRawStream,
  width: number,
  height: number,
): { pixels: Uint8Array; channels: 1 | 3 } | null {
  const dict = stream.dict;
  if (dict.has(n("Decode"))) return null;
  const bpc = numberOf(dict.get(n("BitsPerComponent"))) ?? 8;
  if (![1, 2, 4, 8].includes(bpc)) return null;

  const space = colorSpace(doc, dict.get(n("ColorSpace")));
  if (!space) return null;
  const components = space.kind === "indexed" ? 1 : space.components;

  let data: Uint8Array;
  try {
    data = decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
  const rowBytes = Math.ceil((width * components * bpc) / 8);
  const parms = doc.context.lookupMaybe(dict.get(n("DecodeParms")), PDFDict);
  const predictor = numberOf(parms?.get(n("Predictor"))) ?? 1;
  if (predictor >= 10) {
    data = unpredictPng(data, Math.max(1, Math.ceil((components * bpc) / 8)), rowBytes);
  } else if (predictor !== 1) {
    return null;
  }
  if (data.length < rowBytes * height) return null;

  // Unpack samples to one byte each.
  const samples = new Uint8Array(width * height * components);
  const max = (1 << bpc) - 1;
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * components; i++) {
      let value: number;
      if (bpc === 8) value = data[y * rowBytes + i]!;
      else {
        const bit = i * bpc;
        const byte = data[y * rowBytes + (bit >> 3)]!;
        value = (byte >> (8 - bpc - (bit & 7))) & max;
      }
      samples[y * width * components + i] =
        space.kind === "indexed" ? value : Math.round((value * 255) / max);
    }
  }

  if (space.kind === "indexed") {
    const { base, lookup } = space;
    const pixels = new Uint8Array(width * height * base);
    for (let i = 0; i < width * height; i++) {
      pixels.set(lookup.subarray(samples[i]! * base, samples[i]! * base + base), i * base);
    }
    return { pixels, channels: base };
  }
  return { pixels: samples, channels: space.components };
}

type ColorSpace =
  { kind: "device"; components: 1 | 3 } | { kind: "indexed"; base: 1 | 3; lookup: Uint8Array };

function colorSpace(doc: PDFDocument, value: PDFObject | undefined): ColorSpace | null {
  const cs = doc.context.lookup(value);
  if (cs instanceof PDFName) {
    const name = cs.asString();
    if (name === "/DeviceGray" || name === "/CalGray") return { kind: "device", components: 1 };
    if (name === "/DeviceRGB" || name === "/CalRGB") return { kind: "device", components: 3 };
    return null;
  }
  if (!(cs instanceof PDFArray)) return null;
  const family = cs.get(0)?.toString();
  if (family === "/CalGray") return { kind: "device", components: 1 };
  if (family === "/CalRGB") return { kind: "device", components: 3 };
  if (family === "/ICCBased") {
    const profile = doc.context.lookupMaybe(cs.get(1), PDFStream);
    const components = numberOf(profile?.dict.get(n("N")));
    return components === 1 || components === 3 ? { kind: "device", components } : null;
  }
  if (family === "/Indexed") {
    const base = colorSpace(doc, cs.get(1));
    if (!base || base.kind !== "device") return null;
    const table = doc.context.lookup(cs.get(3));
    let lookup: Uint8Array | null = null;
    if (table instanceof PDFString || table instanceof PDFHexString) lookup = table.asBytes();
    else if (table instanceof PDFRawStream) {
      try {
        lookup = decodePDFRawStream(table).decode();
      } catch {
        return null;
      }
    }
    return lookup ? { kind: "indexed", base: base.components, lookup } : null;
  }
  return null;
}
