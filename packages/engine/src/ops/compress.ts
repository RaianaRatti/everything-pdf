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

/**
 * Re-encodes JPEG image data. The engine doesn't decode images itself, so the host supplies a
 * codec (in the browser: createImageBitmap + OffscreenCanvas). Returning null skips the image.
 */
export interface ImageCodec {
  reencodeJpeg(
    jpeg: Uint8Array,
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

export async function compress(
  bytes: Uint8Array,
  options: CompressOptions,
  codec: ImageCodec,
): Promise<CompressResult> {
  const doc = await loadPdf(bytes);
  let imagesRecompressed = 0;

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
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

  removeUnreferencedObjects(doc);
  const out = await doc.save({ useObjectStreams: true });

  return out.length < bytes.length
    ? { bytes: out, originalSize: bytes.length, newSize: out.length, imagesRecompressed }
    : { bytes, originalSize: bytes.length, newSize: bytes.length, imagesRecompressed: 0 };
}
