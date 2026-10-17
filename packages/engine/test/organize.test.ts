import { describe, expect, it } from "vitest";
import {
  PdfEngineError,
  assemble,
  extractGroups,
  imagesToPdf,
  inspect,
  merge,
  split,
} from "../src";
import { fixture, makePdf, readPdf, texts } from "./helpers";

describe("merge", () => {
  it("concatenates documents in order", async () => {
    const a = await makePdf(["A1", "A2"]);
    const b = await makePdf(["B1"]);
    expect(await texts(await merge([a, b]))).toEqual(["A1", "A2", "B1"]);
  });
});

describe("assemble", () => {
  it("reorders, deletes, duplicates and interleaves across files", async () => {
    const a = await makePdf(["A1", "A2", "A3"]);
    const b = await makePdf(["B1", "B2"]);
    const out = await assemble({ a, b }, [
      { source: "b", pageIndex: 1 },
      { source: "a", pageIndex: 0 },
      { source: "a", pageIndex: 0 },
      { source: "b", pageIndex: 0 },
      { source: "a", pageIndex: 2 },
    ]);
    expect(await texts(out)).toEqual(["B2", "A1", "A1", "B1", "A3"]);
  });

  it("duplicated pages can be rotated independently", async () => {
    const a = await makePdf(["A1"]);
    const out = await assemble({ a }, [
      { source: "a", pageIndex: 0 },
      { source: "a", pageIndex: 0, rotation: 90 },
    ]);
    const pages = await readPdf(out);
    expect(pages.map((p) => p.rotation)).toEqual([0, 90]);
  });

  it("duplicating a page doesn't copy its images again", async () => {
    const photo = await imagesToPdf([{ bytes: fixture("photo.jpg"), type: "jpg" }]);
    const once = await assemble({ photo }, [{ source: "photo", pageIndex: 0 }]);
    const twice = await assemble({ photo }, [
      { source: "photo", pageIndex: 0 },
      { source: "photo", pageIndex: 0 },
    ]);
    expect(twice.length).toBeLessThan(once.length * 1.05);
  });

  it("adds rotation on top of a page's existing rotation", async () => {
    const a = await makePdf([{ label: "R", rotation: 90 }]);
    const out = await assemble({ a }, [{ source: "a", pageIndex: 0, rotation: 270 }]);
    expect((await readPdf(out))[0]!.rotation).toBe(0);
  });

  it("rejects empty output and unknown pages", async () => {
    const a = await makePdf(["A1"]);
    await expect(assemble({ a }, [])).rejects.toThrow(PdfEngineError);
    await expect(assemble({ a }, [{ source: "a", pageIndex: 3 }])).rejects.toThrow(PdfEngineError);
  });
});

describe("split", () => {
  const doc = makePdf(["1", "2", "3", "4", "5"]);

  it("splits into single pages", async () => {
    const parts = await split(await doc, { kind: "single" });
    expect(await Promise.all(parts.map((p) => texts(p.bytes)))).toEqual([
      ["1"],
      ["2"],
      ["3"],
      ["4"],
      ["5"],
    ]);
  });

  it("splits every N pages", async () => {
    const parts = await split(await doc, { kind: "every", pages: 2 });
    expect(parts.map((p) => p.pages)).toEqual([[0, 1], [2, 3], [4]]);
    expect(await texts(parts[2]!.bytes)).toEqual(["5"]);
  });

  it("splits by custom ranges", async () => {
    const parts = await split(await doc, { kind: "ranges", ranges: "4-5, 1" });
    expect(await Promise.all(parts.map((p) => texts(p.bytes)))).toEqual([["4", "5"], ["1"]]);
  });

  it("extracts groups", async () => {
    const [part] = await extractGroups(await doc, [[4, 0]]);
    expect(await texts(part!.bytes)).toEqual(["5", "1"]);
  });
});

describe("inspect", () => {
  it("reports page count", async () => {
    expect(await inspect(await makePdf(["a", "b"]))).toMatchObject({ pageCount: 2 });
  });

  it("rejects password-protected PDFs with a readable error", async () => {
    const err = await inspect(fixture("encrypted.pdf")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfEngineError);
    expect((err as PdfEngineError).code).toBe("encrypted");
  });

  it("rejects non-PDF data with a readable error", async () => {
    const err = await inspect(new TextEncoder().encode("hello")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfEngineError);
    expect((err as PdfEngineError).code).toBe("invalid");
  });
});
