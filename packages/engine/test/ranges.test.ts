import { describe, expect, it } from "vitest";
import { PdfEngineError, chunkPages, parsePageRanges } from "../src";

describe("parsePageRanges", () => {
  it("parses single pages, ranges, open ends and reversed ranges", () => {
    expect(parsePageRanges("1-3, 5, 8-, -2, 4-2", 9)).toEqual([
      [0, 1, 2],
      [4],
      [7, 8],
      [0, 1],
      [3, 2, 1],
    ]);
  });

  it("tolerates whitespace and empty parts", () => {
    expect(parsePageRanges(" 2 - 3 ,, 1 ", 3)).toEqual([[1, 2], [0]]);
  });

  it.each(["", "abc", "0", "11", "1-11", "-", "1-2-3", "2.5"])("rejects %j", (input) => {
    expect(() => parsePageRanges(input, 10)).toThrow(PdfEngineError);
  });
});

describe("chunkPages", () => {
  it("splits into chunks with a short final chunk", () => {
    expect(chunkPages(5, 2)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it("rejects invalid sizes", () => {
    expect(() => chunkPages(5, 0)).toThrow(PdfEngineError);
  });
});
