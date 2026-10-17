import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { type ImageCodec, compress, imagesToPdf, removeUnreferencedObjects } from "../src";
import { fixture, makePdf, readPdf } from "./helpers";

/** Stands in for the browser's canvas-based codec: always returns a small, valid JPEG. */
const smallJpegCodec: ImageCodec = {
  async reencodeJpeg() {
    return { bytes: fixture("small.jpg"), width: 48, height: 32 };
  },
};

function imageWidths(doc: PDFDocument): number[] {
  return doc.context
    .enumerateIndirectObjects()
    .flatMap(([, obj]) =>
      obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")
        ? [Number(obj.dict.get(PDFName.of("Width"))!.toString())]
        : [],
    );
}

describe("compress", () => {
  it("re-encodes JPEG images and updates their dimensions", async () => {
    const pdf = await imagesToPdf([{ bytes: fixture("photo.jpg"), type: "jpg" }]);
    const result = await compress(pdf, { quality: 0.5, maxDimension: 100 }, smallJpegCodec);

    expect(result.imagesRecompressed).toBe(1);
    expect(result.newSize).toBeLessThan(result.originalSize / 10);
    expect(imageWidths(await PDFDocument.load(result.bytes))).toEqual([48]);
    // Page geometry is unchanged: the smaller image is stretched to the same box.
    const [page] = await readPdf(result.bytes);
    expect(Math.round(page!.width)).toBe(360);
  });

  it("keeps the original when compression wouldn't make it smaller", async () => {
    const pdf = await imagesToPdf([{ bytes: fixture("small.jpg"), type: "jpg" }]);
    const bigger: ImageCodec = {
      async reencodeJpeg() {
        return { bytes: fixture("photo.jpg"), width: 480, height: 320 };
      },
    };
    const result = await compress(pdf, { quality: 0.9, maxDimension: 4000 }, bigger);
    expect(result.imagesRecompressed).toBe(0);
    expect(result.bytes).toBe(pdf);
  });

  it("skips images the codec can't handle", async () => {
    const pdf = await imagesToPdf([{ bytes: fixture("photo.jpg"), type: "jpg" }]);
    const failing: ImageCodec = {
      async reencodeJpeg() {
        throw new Error("decode failed");
      },
    };
    const result = await compress(pdf, { quality: 0.5, maxDimension: 100 }, failing);
    expect(result.imagesRecompressed).toBe(0);
  });
});

describe("removeUnreferencedObjects", () => {
  it("drops orphaned objects and keeps the document valid", async () => {
    const doc = await PDFDocument.load(await makePdf(["a"]));
    doc.context.register(doc.context.obj({ Orphan: true }));
    expect(removeUnreferencedObjects(doc)).toBe(1);
    const [page] = await readPdf(await doc.save());
    expect(page!.text).toBe("a");
  });
});
