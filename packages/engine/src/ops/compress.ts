import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";
import { loadPdf } from "../load";
import type { CompressOptions } from "../presets";
import { decodeSamples } from "./extractImages";
import { optimizeStructure } from "./security";

/**
 * Re-encodes JPEG image data. The engine doesn't decode images itself, so the host supplies a
 * codec (in the browser: createImageBitmap + OffscreenCanvas). Returning null skips the image.
 */
export interface ImageCodec {
  reencodeJpeg(
    jpeg: Uint8Array,
    options: { quality: number; maxDimension: number },
  ): Promise<{ bytes: Uint8Array; width: number; height: number } | null>;
  /** Encodes raw 8-bit gray (1 channel) or RGB (3) pixels as JPEG. Optional. */
  encodeJpeg?(
    pixels: Uint8Array,
    size: { width: number; height: number; channels: 1 | 3 },
    options: { quality: number; maxDimension: number },
  ): Promise<{ bytes: Uint8Array; width: number; height: number } | null>;
}

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  /** Equals originalSize when compression didn't help and the original was kept. */
  newSize: number;
  imagesRecompressed: number;
}

const N = {
  Subtype: PDFName.of("Subtype"),
  Image: PDFName.of("Image"),
  Filter: PDFName.of("Filter"),
  DCTDecode: PDFName.of("DCTDecode"),
  ColorSpace: PDFName.of("ColorSpace"),
  DeviceRGB: PDFName.of("DeviceRGB"),
  DeviceGray: PDFName.of("DeviceGray"),
  ICCBased: PDFName.of("ICCBased"),
  BitsPerComponent: PDFName.of("BitsPerComponent"),
  ImageMask: PDFName.of("ImageMask"),
  Width: PDFName.of("Width"),
  Height: PDFName.of("Height"),
  Decode: PDFName.of("Decode"),
  DecodeParms: PDFName.of("DecodeParms"),
  N: PDFName.of("N"),
};

/** Only touch JPEGs whose colors a browser canvas reproduces faithfully as RGB. */
function isSafeJpeg(doc: PDFDocument, dict: PDFDict): boolean {
  if (dict.get(N.Subtype) !== N.Image) return false;
  if (dict.get(N.ImageMask)) return false;
  if (dict.get(N.Decode)) return false;

  const filter = dict.get(N.Filter);
  const isDct =
    filter === N.DCTDecode ||
    (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === N.DCTDecode);
  if (!isDct) return false;

  const bpc = dict.get(N.BitsPerComponent);
  if (bpc instanceof PDFNumber && bpc.asNumber() !== 8) return false;

  const cs = doc.context.lookup(dict.get(N.ColorSpace));
  if (cs === N.DeviceRGB || cs === N.DeviceGray) return true;
  if (cs instanceof PDFArray && cs.get(0) === N.ICCBased) {
    const profile = doc.context.lookup(cs.get(1));
    const components = profile instanceof PDFStream ? profile.dict.get(N.N) : undefined;
    return components instanceof PDFNumber && components.asNumber() !== 4;
  }
  return false;
}

/** Deletes objects that nothing references, e.g. leftovers from earlier edits. */
export function removeUnreferencedObjects(doc: PDFDocument): number {
  const reachable = new Set<PDFRef>();
  const visit = (obj: PDFObject | undefined): void => {
    if (!obj) return;
    if (obj instanceof PDFRef) {
      if (reachable.has(obj)) return;
      reachable.add(obj);
      visit(doc.context.lookup(obj));
    } else if (obj instanceof PDFDict) {
      for (const [, value] of obj.entries()) visit(value);
    } else if (obj instanceof PDFArray) {
      for (const value of obj.asArray()) visit(value);
    } else if (obj instanceof PDFStream) {
      visit(obj.dict);
    }
  };
  visit(doc.context.trailerInfo.Root);
  visit(doc.context.trailerInfo.Info);

  let removed = 0;
  for (const [ref] of doc.context.enumerateIndirectObjects()) {
    if (!reachable.has(ref)) {
      doc.context.delete(ref);
      removed++;
    }
  }
  return removed;
}

/**
 * Photos stored losslessly (Flate) are often far bigger than they need to be. Re-encode those
 * that look like photos (many distinct colors) as JPEG when that's clearly smaller; leave
 * line art, screenshots and diagrams alone, since JPEG would blur their edges.
 */
async function recompressLosslessPhotos(
  doc: PDFDocument,
  options: CompressOptions,
  codec: ImageCodec,
): Promise<number> {
  let count = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(N.Subtype) !== N.Image || dict.get(N.ImageMask)) continue;
    const filter = dict.get(N.Filter);
    if (filter && filter !== PDFName.of("FlateDecode")) continue;
    const width = dict.get(N.Width);
    const height = dict.get(N.Height);
    if (!(width instanceof PDFNumber && height instanceof PDFNumber)) continue;
    const w = width.asNumber();
    const h = height.asNumber();
    if (w * h < 200 * 200) continue;

    const decoded = decodeSamples(doc, obj, w, h);
    if (!decoded || !looksLikePhoto(decoded.pixels, decoded.channels)) continue;
    let result: Awaited<ReturnType<NonNullable<ImageCodec["encodeJpeg"]>>>;
    try {
      result = await codec.encodeJpeg!(
        decoded.pixels,
        { width: w, height: h, channels: decoded.channels },
        options,
      );
    } catch {
      continue;
    }
    // Only worth it if it saves at least a quarter.
    if (!result || result.bytes.length > obj.contents.length * 0.75) continue;

    const next = dict.clone(doc.context);
    next.set(N.Width, PDFNumber.of(result.width));
    next.set(N.Height, PDFNumber.of(result.height));
    next.set(N.Filter, N.DCTDecode);
    next.set(N.ColorSpace, N.DeviceRGB);
    next.set(N.BitsPerComponent, PDFNumber.of(8));
    next.delete(N.DecodeParms);
    next.delete(N.Decode);
    doc.context.assign(ref, PDFRawStream.of(next, result.bytes));
    count++;
  }
  return count;
}

/** Many distinct colors in a sample of pixels means a photo; few means graphics or text. */
function looksLikePhoto(pixels: Uint8Array, channels: 1 | 3): boolean {
  const total = pixels.length / channels;
  const step = Math.max(1, Math.floor(total / 4096));
  const colors = new Set<number>();
  for (let i = 0; i < total; i += step) {
    const o = i * channels;
    colors.add(
      channels === 1 ? pixels[o]! : (pixels[o]! << 16) | (pixels[o + 1]! << 8) | pixels[o + 2]!,
    );
  }
  return colors.size > (channels === 1 ? 48 : 256);
}

export async function compress(
  bytes: Uint8Array,
  options: CompressOptions,
  codec: ImageCodec,
): Promise<CompressResult> {
  const doc = await loadPdf(bytes);
  let imagesRecompressed = 0;

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (options.images === false) break;
    if (!(obj instanceof PDFRawStream) || !isSafeJpeg(doc, obj.dict)) continue;

    let result: Awaited<ReturnType<ImageCodec["reencodeJpeg"]>>;
    try {
      result = await codec.reencodeJpeg(obj.contents, options);
    } catch {
      continue;
    }
    if (!result || result.bytes.length >= obj.contents.length) continue;

    const dict = obj.dict.clone(doc.context);
    dict.set(N.Width, PDFNumber.of(result.width));
    dict.set(N.Height, PDFNumber.of(result.height));
    dict.set(N.Filter, N.DCTDecode);
    dict.set(N.ColorSpace, N.DeviceRGB);
    dict.set(N.BitsPerComponent, PDFNumber.of(8));
    dict.delete(N.DecodeParms);
    doc.context.assign(ref, PDFRawStream.of(dict, result.bytes));
    imagesRecompressed++;
  }

  if (options.images !== false && codec.encodeJpeg) {
    imagesRecompressed += await recompressLosslessPhotos(doc, options, codec);
  }

  removeUnreferencedObjects(doc);
  let out = await doc.save({ useObjectStreams: true });
  // Then squeeze the structure: highest-level Flate everywhere, packed objects.
  try {
    const optimized = await optimizeStructure(out);
    if (optimized.length < out.length) out = optimized;
  } catch {
    // qpdf couldn't process it; keep pdf-lib's output.
  }

  return out.length < bytes.length
    ? { bytes: out, originalSize: bytes.length, newSize: out.length, imagesRecompressed }
    : { bytes, originalSize: bytes.length, newSize: bytes.length, imagesRecompressed: 0 };
}
