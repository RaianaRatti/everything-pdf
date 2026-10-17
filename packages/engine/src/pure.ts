/**
 * Helpers that don't depend on pdf-lib, safe to import on the main thread without pulling the
 * PDF library into the page bundle. Heavy operations run in a worker via the main entry point.
 */
export { PdfEngineError, type PdfErrorCode } from "./errors";
export { parsePageRanges, chunkPages, planSplit, type SplitMode } from "./ranges";
export { normalizeRotation } from "./geometry";
export { jpegOrientation, sniffImageType, type ImageType } from "./sniff";
export { grayscalePixels, invertPixels } from "./ops/invert";
export {
  compressPresets,
  defaultPageNumberOptions,
  defaultWatermarkOptions,
  defaultHeaderFooterOptions,
  expandTemplate,
  PAPER_SIZES,
  emptyDocInfo,
  formatPageNumber,
  type CompressOptions,
  type PageNumberOptions,
  type NumberPosition,
  type NumberFormat,
  type WatermarkOptions,
  type DocInfo,
  type EdgeText,
  type HeaderFooterOptions,
  type PaperSize,
  type ResizeOptions,
  type WatermarkLayout,
} from "./presets";
export type { FontFamily } from "./text";
