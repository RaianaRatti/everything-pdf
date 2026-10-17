export interface CompressOptions {
  /** JPEG quality, 0–1. */
  quality: number;
  /** Images larger than this (in pixels, on the longer side) are downscaled. */
  maxDimension: number;
}

export const compressPresets = {
  low: { quality: 0.85, maxDimension: 3000 },
  medium: { quality: 0.7, maxDimension: 2000 },
  high: { quality: 0.5, maxDimension: 1400 },
} satisfies Record<string, CompressOptions>;

export type NumberPosition =
  "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export type NumberFormat = "n" | "page-n" | "n-of-total" | "page-n-of-total";

export interface PageNumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  /** Number shown on the first numbered page. */
  startAt: number;
  /** Leave the first page (e.g. a cover) unnumbered; numbering starts on page 2. */
  skipFirst: boolean;
  fontSize: number;
  /** Distance from the page edge, in points. */
  margin: number;
}

export const defaultPageNumberOptions: PageNumberOptions = {
  position: "bottom-center",
  format: "n",
  startAt: 1,
  skipFirst: false,
  fontSize: 11,
  margin: 28,
};

export function formatPageNumber(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case "n":
      return `${n}`;
    case "page-n":
      return `Page ${n}`;
    case "n-of-total":
      return `${n} of ${total}`;
    case "page-n-of-total":
      return `Page ${n} of ${total}`;
  }
}

export type WatermarkLayout = "diagonal" | "horizontal";

export interface WatermarkOptions {
  text: string;
  layout: WatermarkLayout;
  /** 0–1. */
  opacity: number;
  /** Text width as a fraction of the space available along its line (the diagonal or width). */
  scale: number;
}

export const defaultWatermarkOptions: WatermarkOptions = {
  text: "CONFIDENTIAL",
  layout: "diagonal",
  opacity: 0.2,
  scale: 0.7,
};

/** The document properties people usually care about (File → Properties in a PDF viewer). */
export interface DocInfo {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export const emptyDocInfo: DocInfo = { title: "", author: "", subject: "", keywords: "" };

/** Left, center and right text for one edge of the page. */
export type EdgeText = [left: string, center: string, right: string];

export interface HeaderFooterOptions {
  header: EdgeText;
  footer: EdgeText;
  fontSize: number;
  margin: number;
  skipFirst: boolean;
  /** Values for {file} and {date}. */
  fileName: string;
  date: string;
}

export const defaultHeaderFooterOptions: HeaderFooterOptions = {
  header: ["", "", ""],
  footer: ["{file}", "", "Page {page} of {total}"],
  fontSize: 9,
  margin: 24,
  skipFirst: false,
  fileName: "",
  date: "",
};

/** Fills in {page}, {total}, {file} and {date}. Unknown {words} are left as typed. */
export function expandTemplate(
  template: string,
  vars: { page: number; total: number; file: string; date: string },
): string {
  return template.replace(/\{(page|total|file|date)\}/g, (_, key: keyof typeof vars) =>
    String(vars[key]),
  );
}

export type PaperSize = "a3" | "a4" | "a5" | "letter" | "legal";

/** Portrait sizes in points. */
export const PAPER_SIZES: Record<PaperSize, [number, number]> = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
};

export interface ResizeOptions {
  size: PaperSize;
  /** "auto" keeps each page's own orientation. */
  orientation: "auto" | "portrait" | "landscape";
  /** White space kept around the content, in points. */
  margin: number;
}
