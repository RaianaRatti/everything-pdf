import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addHeaderFooter,
  addImageWatermark,
  addTextLayer,
  applyEdits,
  blankPdf,
  cropPages,
  expandTemplate,
  resizePages,
} from "../src";
import { annotations, fixture, imageBoxes, makePdf, readPdf, texts } from "./helpers";

describe("addHeaderFooter", () => {
  it("expands templates", () => {
    expect(
      expandTemplate("{file} {page}/{total} {date} {other}", {
        page: 2,
        total: 5,
        file: "a.pdf",
        date: "today",
      }),
    ).toBe("a.pdf 2/5 today {other}");
  });

  it("writes header and footer text on every page, skipping the cover if asked", async () => {
    const out = await addHeaderFooter(await makePdf(["cover", "b", "c"]), {
      header: ["", "Report", ""],
      footer: ["{file}", "", "{page} of {total}"],
      fileName: "q3.pdf",
      skipFirst: true,
    });
    expect(await texts(out)).toEqual(["cover", "b Report q3.pdf 2 of 3", "c Report q3.pdf 3 of 3"]);
  });

  it.each([0, 90])("puts the header at the top of a page rotated %i°", async (rotation) => {
    const pdf = await makePdf([{ label: "x", size: [300, 500], rotation }]);
    const [page] = await readPdf(
      await addHeaderFooter(pdf, { header: ["", "", "TOP"], footer: ["", "", ""] }),
    );
    const top = page!.items.find((i) => i.str === "TOP")!;
    expect(top.y).toBeLessThan(page!.height * 0.15);
    expect(top.x).toBeGreaterThan(page!.width * 0.7);
  });
});

describe("addImageWatermark", () => {
  it("centers the image on every page", async () => {
    const out = await addImageWatermark(
      await makePdf([{ label: "x", size: [300, 500], rotation: 90 }]),
      { bytes: fixture("red.png"), type: "png" },
      { scale: 0.5 },
    );
    const [box] = await imageBoxes(out);
    expect(box!.x + box!.width / 2).toBeCloseTo(0.5, 3);
    expect(box!.y + box!.height / 2).toBeCloseTo(0.5, 3);
    // Half the page in its limiting direction (here the height of the wide page).
    expect(Math.max(box!.width, box!.height)).toBeCloseTo(0.5, 3);
  });
});

describe("cropPages", () => {
  it.each([0, 90, 180, 270])("keeps the chosen area of a page rotated %i°", async (rotation) => {
    const pdf = await makePdf([{ label: "x", size: [300, 500], rotation }]);
    const [before] = await readPdf(pdf);
    const out = await cropPages(pdf, [
      { pageIndex: 0, rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.25 } },
    ]);
    const [after] = await readPdf(out);
    expect(after!.width).toBeCloseTo(before!.width * 0.5, 3);
    expect(after!.height).toBeCloseTo(before!.height * 0.25, 3);
  });

  it("shows the same content that was inside the crop area", async () => {
    const pdf = await makePdf([{ label: "x", size: [300, 400] }]);
    const [before] = await readPdf(pdf);
    const label = before!.items[0]!;
    // A box around the label, in visual fractions.
    const rect = { x: 0, y: label.y / before!.height - 0.2, width: 0.5, height: 0.3 };
    const [after] = await readPdf(await cropPages(pdf, [{ pageIndex: 0, rect }]));
    const moved = after!.items[0]!;
    expect(moved.x).toBeCloseTo(label.x, 1);
    expect(moved.y).toBeCloseTo(label.y - rect.y * before!.height, 1);
  });
});

describe("resizePages", () => {
  it("fits pages on A4 in their own orientation, upright", async () => {
    const pdf = await makePdf([
      { label: "tall", size: [300, 500] },
      { label: "turned", size: [300, 500], rotation: 90 },
      { label: "flipped", size: [300, 500], rotation: 180 },
    ]);
    const pages = await readPdf(
      await resizePages(pdf, { size: "a4", orientation: "auto", margin: 0 }),
    );
    expect(pages.map((p) => [Math.round(p.width), Math.round(p.height), p.rotation])).toEqual([
      [595, 842, 0],
      [842, 595, 0],
      [595, 842, 0],
    ]);
    // Content lands on the page (a wrong rotation would push it off).
    for (const page of pages) {
      const item = page.items[0]!;
      expect(item.x).toBeGreaterThan(0);
      expect(item.x).toBeLessThan(page.width);
      expect(item.y).toBeGreaterThan(0);
      expect(item.y).toBeLessThan(page.height);
    }
    expect(pages.map((p) => p.text)).toEqual(["tall", "turned", "flipped"]);
  });

  it("matches the label's displayed position after baking in rotation", async () => {
    const pdf = await makePdf([{ label: "turned", size: [300, 500], rotation: 90 }]);
    const [before] = await readPdf(pdf);
    const [after] = await readPdf(
      await resizePages(pdf, { size: "a4", orientation: "auto", margin: 0 }),
    );
    // Same relative position (within the letterboxed area, which is centered).
    const scale = Math.min(after!.width / before!.width, after!.height / before!.height);
    const offsetX = (after!.width - before!.width * scale) / 2;
    const offsetY = (after!.height - before!.height * scale) / 2;
    expect(after!.items[0]!.x).toBeCloseTo(before!.items[0]!.x * scale + offsetX, 0);
    expect(after!.items[0]!.y).toBeCloseTo(before!.items[0]!.y * scale + offsetY, 0);
  });
});

describe("applyEdits", () => {
  it.each([0, 90])("draws text where it was placed on a page rotated %i°", async (rotation) => {
    const pdf = await makePdf([{ label: "x", size: [300, 500], rotation }]);
    const out = await applyEdits(pdf, [
      {
        pageIndex: 0,
        objects: [
          {
            kind: "text",
            box: { x: 0.5, y: 0.1, width: 0.4, height: 0.1 },
            text: "Hello\nWorld",
            fontSize: 12,
            font: "sans",
            color: [0, 0, 0],
          },
        ],
      },
    ]);
    const [page] = await readPdf(out);
    const hello = page!.items.find((i) => i.str === "Hello")!;
    const world = page!.items.find((i) => i.str === "World")!;
    expect(hello.x / page!.width).toBeCloseTo(0.5, 2);
    // Baseline is one ascent below the top of the box; the next line is lower.
    expect(hello.y).toBeGreaterThan(page!.height * 0.1);
    expect(hello.y).toBeLessThan(page!.height * 0.1 + 14);
    expect(world.y).toBeGreaterThan(hello.y);
  });

  it("adds highlight and note annotations and an opaque whiteout box", async () => {
    const pdf = await makePdf(["x"]);
    const box = { x: 0.1, y: 0.1, width: 0.3, height: 0.05 };
    const out = await applyEdits(pdf, [
      {
        pageIndex: 0,
        objects: [
          { kind: "whiteout", box, color: [1, 1, 1] },
          { kind: "highlight", box, color: [1, 0.9, 0], comment: "check" },
          { kind: "note", box, text: "Remember this", color: [1, 0.8, 0] },
        ],
      },
    ]);
    expect(await annotations(out)).toEqual([
      [
        { subtype: "Highlight", contents: "check" },
        { subtype: "Text", contents: "Remember this" },
      ],
    ]);
  });

  it("rejects text the standard fonts can't draw", async () => {
    const pdf = await makePdf(["x"]);
    const object = {
      kind: "text" as const,
      box: { x: 0, y: 0, width: 1, height: 1 },
      text: "日本",
      fontSize: 12,
      font: "sans" as const,
      color: [0, 0, 0] as [number, number, number],
    };
    await expect(applyEdits(pdf, [{ pageIndex: 0, objects: [object] }])).rejects.toThrow(
      /can't be drawn/,
    );
  });
});

describe("addTextLayer", () => {
  it.each([0, 90])("adds searchable text over words on a page rotated %i°", async (rotation) => {
    const pdf = await makePdf([{ label: "", size: [300, 500], rotation }]);
    const out = await addTextLayer(pdf, [
      {
        pageIndex: 0,
        words: [
          { text: "Scanned", x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
          { text: "olá", x: 0.45, y: 0.2, width: 0.15, height: 0.04 },
        ],
      },
    ]);
    const [page] = await readPdf(out);
    expect(page!.text).toBe("Scanned olá");
    const word = page!.items[0]!;
    expect(word.x / page!.width).toBeCloseTo(0.1, 2);
    // Baseline sits inside the word's box.
    expect(word.y / page!.height).toBeGreaterThan(0.2);
    expect(word.y / page!.height).toBeLessThan(0.24);
  });
});

describe("blankPdf", () => {
  it("makes empty pages of the given size", async () => {
    const doc = await PDFDocument.load(await blankPdf(200, 300, 2));
    expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
      [200, 300],
      [200, 300],
    ]);
  });
});
