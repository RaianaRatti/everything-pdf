import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { main, type Io } from "../src/main";
import { imageBoxes, makePdf, readPdf, texts } from "../../engine/test/helpers";

let dir: string;
let io: Io & { lines: string[]; errors: string[] };

/** Runs the CLI in-process in a scratch directory. */
async function epdf(...args: string[]): Promise<number> {
  return main(args, io);
}
const file = (name: string) => new Uint8Array(readFileSync(join(dir, name)));

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "epdf-"));
  const lines: string[] = [];
  const errors: string[] = [];
  io = {
    cwd: dir,
    lines,
    errors,
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    progress: () => {},
  };
  writeFileSync(join(dir, "a.pdf"), await makePdf(["A1", "A2", { label: "A3", rotation: 90 }]));
  writeFileSync(join(dir, "b.pdf"), await makePdf(["B1", "B2"]));
  for (const f of ["photo.jpg", "red.png", "encrypted.pdf"]) {
    copyFileSync(new URL(`../../engine/test/fixtures/${f}`, import.meta.url), join(dir, f));
  }
});

describe("help and usage", () => {
  it("lists commands", async () => {
    expect(await epdf()).toBe(0);
    expect(io.lines[0]).toContain("usage: epdf <command>");
    expect(io.lines[0]).toContain("merge");
  });

  it("rejects unknown commands and options with exit code 2", async () => {
    expect(await epdf("frobnicate")).toBe(2);
    expect(await epdf("merge", "a.pdf", "b.pdf", "--nope")).toBe(2);
    expect(io.errors.at(-1)).toContain("usage: epdf merge");
  });

  it("explains bad input files with exit code 1", async () => {
    expect(await epdf("info", "missing.pdf")).toBe(1);
    expect(io.errors.at(-1)).toContain("missing.pdf: no such file");
    expect(await epdf("info", "encrypted.pdf")).toBe(1);
    expect(io.errors.at(-1)).toContain("password-protected");
  });

  it("never overwrites an input file", async () => {
    expect(await epdf("rotate", "a.pdf", "-o", "a.pdf")).toBe(2);
    expect(await texts(file("a.pdf"))).toEqual(["A1", "A2", "A3"]);
  });
});

describe("page commands", () => {
  it("merges", async () => {
    expect(await epdf("merge", "a.pdf", "b.pdf", "-o", "out.pdf")).toBe(0);
    expect(await texts(file("out.pdf"))).toEqual(["A1", "A2", "A3", "B1", "B2"]);
    expect(io.lines).toEqual(["wrote out.pdf (5 pages, 2 KB)"]);
  });

  it("splits every N pages into a folder", async () => {
    expect(await epdf("split", "a.pdf", "--every", "2")).toBe(0);
    expect(readdirSync(join(dir, "a-split")).sort()).toEqual(["a-page-3.pdf", "a-pages-1-2.pdf"]);
    expect(await texts(file("a-split/a-page-3.pdf"))).toEqual(["A3"]);
  });

  it("splits by ranges", async () => {
    expect(await epdf("split", "a.pdf", "--ranges", "3,1-2", "-o", "parts")).toBe(0);
    expect(await texts(file("parts/a-pages-1-2.pdf"))).toEqual(["A1", "A2"]);
  });

  it("extracts, deletes and reorders", async () => {
    await epdf("extract", "a.pdf", "--pages", "3,1");
    expect(await texts(file("a-extracted.pdf"))).toEqual(["A3", "A1"]);
    await epdf("delete", "a.pdf", "-p", "2");
    expect(await texts(file("a-trimmed.pdf"))).toEqual(["A1", "A3"]);
    await epdf("reorder", "a.pdf", "--order", "3-1,1");
    expect(await texts(file("a-reordered.pdf"))).toEqual(["A3", "A2", "A1", "A1"]);
  });

  it("refuses to delete every page", async () => {
    expect(await epdf("delete", "a.pdf", "--pages", "1-")).toBe(2);
  });

  it("rotates selected pages", async () => {
    await epdf("rotate", "a.pdf", "--angle", "-90", "--pages", "1,3");
    expect((await readPdf(file("a-rotated.pdf"))).map((p) => p.rotation)).toEqual([270, 0, 0]);
  });
});

describe("content commands", () => {
  it("adds page numbers", async () => {
    await epdf("number", "a.pdf", "--format", "page-n-of-total", "--skip-first");
    expect(await texts(file("a-numbered.pdf"))).toEqual(["A1", "A2 Page 1 of 2", "A3 Page 2 of 2"]);
  });

  it("rejects bad option values", async () => {
    expect(await epdf("number", "a.pdf", "--position", "middle")).toBe(2);
    expect(io.errors.at(-1)).toContain("--position must be one of");
  });

  it("signs a page, keeping the image's proportions", async () => {
    expect(
      await epdf(
        "sign",
        "a.pdf",
        "--image",
        "red.png",
        "--page",
        "2",
        "--x",
        "10%",
        "--y",
        "0.5",
        "--width",
        "0.4",
      ),
    ).toBe(0);
    const pages = await readPdf(file("a-signed.pdf"));
    expect(pages.map((p) => p.text)).toEqual(["A1", "A2", "A3"]);
    // imageBoxes reads the first page, so pull page 2 out on its own.
    await epdf("extract", "a-signed.pdf", "--pages", "2", "-o", "p2.pdf");
    const [box] = await imageBoxes(file("p2.pdf"));
    expect(box!.x).toBeCloseTo(0.1, 3);
    expect(box!.y).toBeCloseTo(0.5, 3);
    expect(box!.width).toBeCloseTo(0.4, 3);
    // 300×400 page: 120pt wide, so a 40×30 image is 90pt tall = 0.225 of the page.
    expect(box!.height).toBeCloseTo(0.225, 3);
  });

  it("inverts colors by rendering pages", async () => {
    expect(await epdf("invert", "a.pdf", "--pages", "1", "--dpi", "72")).toBe(0);
    const pages = await readPdf(file("a-inverted.pdf"));
    expect(pages.map((p) => p.text)).toEqual(["", "A2", "A3"]);
    // The inverted page is now one full-page image.
    const [box] = await imageBoxes(file("a-inverted.pdf"));
    expect([box!.x, box!.y, box!.width, box!.height]).toEqual([0, 0, 1, 1]);
  });

  it("compresses photos", async () => {
    await epdf("from-images", "photo.jpg", "-o", "photo.pdf");
    expect(await epdf("compress", "photo.pdf", "--level", "high")).toBe(0);
    expect(io.lines.at(-1)).toMatch(
      /^wrote photo-compressed\.pdf \(\d+ KB → \d+ KB, \d+% smaller\)$/,
    );
    expect(file("photo-compressed.pdf").length).toBeLessThan(file("photo.pdf").length);
  });

  it("reports when there's nothing to compress", async () => {
    await epdf("compress", "a.pdf");
    expect(io.lines.at(-1)).toContain("already compact");
    expect(existsSync(join(dir, "a-compressed.pdf"))).toBe(false);
  });
});

describe("conversion", () => {
  it("renders pages to images", async () => {
    expect(
      await epdf("to-images", "a.pdf", "--format", "jpg", "--dpi", "72", "--pages", "2-"),
    ).toBe(0);
    expect(readdirSync(join(dir, "a-images")).sort()).toEqual(["a-page-2.jpg", "a-page-3.jpg"]);
    const jpg = file("a-images/a-page-2.jpg");
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
  });

  it("makes a PDF from images", async () => {
    expect(
      await epdf("from-images", "photo.jpg", "red.png", "--page-size", "a4", "-o", "pics.pdf"),
    ).toBe(0);
    const pages = await readPdf(file("pics.pdf"));
    expect(pages.map((p) => [Math.round(p.width), Math.round(p.height)])).toEqual([
      [842, 595],
      [842, 595],
    ]);
  });

  it("prints info", async () => {
    expect(await epdf("info", "a.pdf")).toBe(0);
    expect(io.lines).toContain("pages:  3");
    expect(io.lines).toContain("size:   300 × 400 pt (2 pages)");
    expect(io.lines).toContain("size:   400 × 300 pt (1 page)");
  });
});
