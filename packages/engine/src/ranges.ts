import { PdfEngineError } from "./errors";

/**
 * Parses a page-range string such as "1-3, 5, 8-" into groups of 0-based page indices.
 * Each comma-separated part becomes one group, and "+" joins pieces into the same group so
 * pages need not be consecutive: "1+3, 2+4" is two groups, [1, 3] and [2, 4]. Open-ended ranges ("8-") run to the last
 * page, and reversed ranges ("5-3") produce descending pages.
 */
export function parsePageRanges(input: string, pageCount: number): number[][] {
  const parts = input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new PdfEngineError("bad-input", "Enter at least one page or range, e.g. 1-3, 5.");
  }

  const toPage = (raw: string, part: string): number => {
    if (!/^\d+$/.test(raw)) {
      throw new PdfEngineError("bad-input", `"${part}" isn't a valid page range.`);
    }
    const n = Number(raw);
    if (n < 1 || n > pageCount) {
      throw new PdfEngineError(
        "bad-input",
        `Page ${n} doesn't exist. This document has ${pageCount} page${pageCount === 1 ? "" : "s"}.`,
      );
    }
    return n;
  };

  const parseRange = (part: string): number[] => {
    const match = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    if (!match) return [toPage(part, part) - 1];
    const [, startRaw = "", endRaw = ""] = match;
    if (!startRaw && !endRaw) {
      throw new PdfEngineError("bad-input", `"${part}" isn't a valid page range.`);
    }
    const start = startRaw ? toPage(startRaw, part) : 1;
    const end = endRaw ? toPage(endRaw, part) : pageCount;
    const step = start <= end ? 1 : -1;
    const pages: number[] = [];
    for (let n = start; n !== end + step; n += step) pages.push(n - 1);
    return pages;
  };

  return parts.map((part) =>
    part.split("+").flatMap((piece) => {
      const trimmed = piece.trim();
      if (!trimmed) throw new PdfEngineError("bad-input", `"${part}" isn't a valid page range.`);
      return parseRange(trimmed);
    }),
  );
}

/** Short human label for a group of 0-based pages: "page 2", "pages 1-3" or "pages 1, 3". */
export function describePages(pages: number[]): string {
  if (pages.length === 1) return `page ${pages[0]! + 1}`;
  const consecutive = pages.every((p, i) => i === 0 || p === pages[i - 1]! + 1);
  const label = consecutive
    ? `${pages[0]! + 1}-${pages.at(-1)! + 1}`
    : pages.map((p) => p + 1).join(", ");
  return `pages ${label}`;
}

/** Splits 0..pageCount-1 into consecutive chunks of `size` pages. */
export function chunkPages(pageCount: number, size: number): number[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new PdfEngineError("bad-input", "Pages per file must be a whole number of at least 1.");
  }
  const chunks: number[][] = [];
  for (let start = 0; start < pageCount; start += size) {
    const chunk: number[] = [];
    for (let i = start; i < Math.min(start + size, pageCount); i++) chunk.push(i);
    chunks.push(chunk);
  }
  return chunks;
}

export type SplitMode =
  { kind: "single" } | { kind: "every"; pages: number } | { kind: "ranges"; ranges: string };

/** Resolves a split mode into groups of 0-based page indices without touching the PDF. */
export function planSplit(mode: SplitMode, pageCount: number): number[][] {
  switch (mode.kind) {
    case "single":
      return chunkPages(pageCount, 1);
    case "every":
      return chunkPages(pageCount, mode.pages);
    case "ranges":
      return parsePageRanges(mode.ranges, pageCount);
  }
}
