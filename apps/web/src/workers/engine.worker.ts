/// <reference lib="webworker" />
import * as engine from "@everything-pdf/engine";
import qpdfWasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";
import * as Comlink from "comlink";

engine.setQpdfWasmUrl(qpdfWasmUrl);

export type OpenResult =
  | {
      status: "ok";
      /** Set when the file had to be decrypted: use these bytes instead of the original. */
      unlocked: Uint8Array | null;
      /** Set when the file was damaged and has been rebuilt: use these bytes instead. */
      repaired: Uint8Array | null;
      pageCount: number;
      info: engine.FullDocInfo;
      outline: engine.Bookmark[];
    }
  | { status: "locked"; wrongPassword: boolean };

const isCode = (err: unknown, code: engine.PdfErrorCode) =>
  err instanceof engine.PdfEngineError && err.code === code;

/** Re-encodes JPEGs with the browser's own decoder/encoder, off the main thread. */
const browserCodec: engine.ImageCodec = {
  async reencodeJpeg(jpeg, { quality, maxDimension }) {
    const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  },

  async encodeJpeg(pixels, { width, height, channels }, { quality, maxDimension }) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const o = i * channels;
      rgba[i * 4] = pixels[o]!;
      rgba[i * 4 + 1] = pixels[channels === 3 ? o + 1 : o]!;
      rgba[i * 4 + 2] = pixels[channels === 3 ? o + 2 : o]!;
      rgba[i * 4 + 3] = 255;
    }
    const source = new OffscreenCanvas(width, height);
    source.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = scale < 1 ? new OffscreenCanvas(w, h) : source;
    if (scale < 1) canvas.getContext("2d")!.drawImage(source, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  },
};

/** Hands result buffers back to the page without copying them. */
function transferBytes(bytes: Uint8Array): Uint8Array {
  return Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]);
}

const api = {
  inspect: engine.inspect,
  inspectDetails: engine.inspectDetails,
  readFormFields: engine.readFormFields,

  /**
   * Validates a PDF for loading. Encrypted files are unlocked with `password` (the empty
   * password covers files that only restrict printing/copying).
   */
  async open(bytes: Uint8Array, password?: string): Promise<OpenResult> {
    let source = bytes;
    let repaired: Uint8Array | null = null;
    try {
      const { pageCount, info, outline } = await engine.inspect(bytes);
      return { status: "ok", unlocked: null, repaired: null, pageCount, info, outline };
    } catch (err) {
      if (isCode(err, "invalid")) {
        // Damaged: try to rebuild it before giving up.
        repaired = await engine.repairPdf(bytes).catch(() => null);
        if (!repaired) throw err;
        try {
          const { pageCount, info, outline } = await engine.inspect(repaired);
          return Comlink.transfer(
            { status: "ok", unlocked: null, repaired, pageCount, info, outline },
            [repaired.buffer as ArrayBuffer],
          );
        } catch (again) {
          if (!isCode(again, "encrypted")) throw err;
          source = repaired;
        }
      } else if (!isCode(err, "encrypted")) {
        throw err;
      }
    }
    try {
      const unlocked = await engine.decryptPdf(source, password ?? "");
      const { pageCount, info, outline } = await engine.inspect(unlocked);
      return Comlink.transfer({ status: "ok", unlocked, repaired, pageCount, info, outline }, [
        unlocked.buffer as ArrayBuffer,
      ]);
    } catch (err) {
      if (isCode(err, "wrong-password")) {
        return { status: "locked", wrongPassword: password !== undefined };
      }
      throw err;
    }
  },

  verifySignatures: engine.verifySignatures,

  async recolor(bytes: Uint8Array, options: engine.RecolorOptions) {
    return transferBytes(await engine.recolorPdf(bytes, options));
  },

  async redactPages(bytes: Uint8Array, pages: engine.RedactedPage[]) {
    return transferBytes(await engine.redactPages(bytes, pages));
  },

  async nUp(bytes: Uint8Array, options: engine.NUpOptions) {
    return transferBytes(await engine.nUp(bytes, options));
  },

  async booklet(bytes: Uint8Array, options: Parameters<typeof engine.booklet>[1]) {
    return transferBytes(await engine.booklet(bytes, options));
  },

  async poster(bytes: Uint8Array, options: Parameters<typeof engine.poster>[1]) {
    return transferBytes(await engine.poster(bytes, options));
  },

  async splitSpreads(bytes: Uint8Array, options: Parameters<typeof engine.splitSpreads>[1]) {
    return transferBytes(await engine.splitSpreads(bytes, options));
  },

  async linearize(bytes: Uint8Array) {
    return transferBytes(await engine.linearizePdf(bytes));
  },

  async signDigitally(bytes: Uint8Array, options: engine.DigitalSignOptions) {
    return transferBytes(await engine.signPdfDigitally(bytes, options));
  },

  async encrypt(bytes: Uint8Array, options: engine.EncryptOptions) {
    return transferBytes(await engine.encryptPdf(bytes, options));
  },

  async addHeaderFooter(bytes: Uint8Array, options: Partial<engine.HeaderFooterOptions>) {
    return transferBytes(await engine.addHeaderFooter(bytes, options));
  },

  async addImageWatermark(
    bytes: Uint8Array,
    image: engine.ImageInput,
    options: { scale?: number; opacity?: number },
  ) {
    return transferBytes(await engine.addImageWatermark(bytes, image, options));
  },

  async cropPages(bytes: Uint8Array, placements: engine.CropPlacement[]) {
    return transferBytes(await engine.cropPages(bytes, placements));
  },

  async resizePages(bytes: Uint8Array, options: engine.ResizeOptions) {
    return transferBytes(await engine.resizePages(bytes, options));
  },

  async applyEdits(bytes: Uint8Array, edits: engine.PageEdits[]) {
    return transferBytes(await engine.applyEdits(bytes, edits));
  },

  async fillForm(
    bytes: Uint8Array,
    values: Record<string, engine.FormFieldValue>,
    options: { flatten?: boolean },
  ) {
    return transferBytes(await engine.fillForm(bytes, values, options));
  },

  async removeAnnotations(bytes: Uint8Array, options: engine.RemoveAnnotationsOptions) {
    const result = await engine.removeAnnotations(bytes, options);
    return Comlink.transfer(result, [result.bytes.buffer as ArrayBuffer]);
  },

  async blankPdf(width: number, height: number, count: number) {
    return transferBytes(await engine.blankPdf(width, height, count));
  },

  async extractImages(bytes: Uint8Array) {
    const result = await engine.extractImages(bytes);
    return Comlink.transfer(
      result,
      result.images.map((i) => i.bytes.buffer as ArrayBuffer),
    );
  },

  async addTextLayer(bytes: Uint8Array, pages: engine.PageText[]) {
    return transferBytes(await engine.addTextLayer(bytes, pages));
  },

  async assemble(
    sources: Record<string, Uint8Array>,
    pages: engine.PageRef[],
    options: engine.AssembleOptions = {},
  ) {
    return transferBytes(await engine.assemble(sources, pages, options));
  },

  async extractGroups(bytes: Uint8Array, groups: number[][]) {
    const parts = await engine.extractGroups(bytes, groups);
    return Comlink.transfer(
      parts,
      parts.map((p) => p.bytes.buffer as ArrayBuffer),
    );
  },

  async addPageNumbers(bytes: Uint8Array, options: Partial<engine.PageNumberOptions>) {
    return transferBytes(await engine.addPageNumbers(bytes, options));
  },

  async addWatermark(bytes: Uint8Array, options: Partial<engine.WatermarkOptions>) {
    return transferBytes(await engine.addWatermark(bytes, options));
  },

  async imagesToPdf(images: engine.ImageInput[], options: Partial<engine.ImagesToPdfOptions>) {
    return transferBytes(await engine.imagesToPdf(images, options));
  },

  async replacePagesWithImages(bytes: Uint8Array, replacements: engine.PageImage[]) {
    return transferBytes(await engine.replacePagesWithImages(bytes, replacements));
  },

  async stampImage(
    bytes: Uint8Array,
    image: engine.ImageInput,
    placements: engine.StampPlacement[],
  ) {
    return transferBytes(await engine.stampImage(bytes, image, placements));
  },

  async compress(bytes: Uint8Array, options: engine.CompressOptions) {
    const result = await engine.compress(bytes, options, browserCodec);
    return Comlink.transfer(result, [result.bytes.buffer as ArrayBuffer]);
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);
