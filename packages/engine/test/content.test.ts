import { describe, expect, it } from "vitest";
import {
  addPageNumbers,
  addWatermark,
  formatPageNumber,
  grayscalePixels,
  imagesToPdf,
  invertPixels,
  replacePagesWithImages,
  sniffImageType,
  stampImage,
} from "../src";
import { fixture, imageBoxes, makePdf, readPdf, texts } from "./helpers";

describe("addPageNumbers", () => {
  it("formats numbers", () => {
    expect(formatPageNumber("page-n-of-total", 2, 9)).toBe("Page 2 of 9");
  });

  it("numbers every page", async () => {
    const out = await addPageNumbers(await makePdf(["a", "b", "c"]), { format: "n-of-total" });
    expect(await texts(out)).toEqual(["a 1 of 3", "b 2 of 3", "c 3 of 3"]);
  });

  it("can skip the cover and start at a custom number", async () => {
    const out = await addPageNumbers(await makePdf(["cover", "b", "c"]), {
      skipFirst: true,
      startAt: 5,
      format: "page-n",
    });
    expect(await texts(out)).toEqual(["cover", "b Page 5", "c Page 6"]);
  });

  it.each([0, 90, 180, 270])("lands bottom-right as displayed on a page rotated %i°", async (r) => {
    const pdf = await makePdf([{ label: "x", size: [300, 500], rotation: r }]);
    const [page] = await readPdf(await addPageNumbers(pdf, { position: "bottom-right" }));
    const number = page!.items.find((i) => i.str === "1")!;
    // Viewport coordinates: origin top-left of the displayed page.
    expect(number.x).toBeGreaterThan(page!.width * 0.8);
    expect(number.y).toBeGreaterThan(page!.height * 0.9);
  });
});

describe("images", () => {
  it("sniffs image types", () => {
    expect(sniffImageType(fixture("photo.jpg"))).toBe("jpg");
    expect(sniffImageType(fixture("red.png"))).toBe("png");
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("makes one page per image, sized to the image by default", async () => {
    const out = await imagesToPdf([
      { bytes: fixture("photo.jpg"), type: "jpg" },
      { bytes: fixture("red.png"), type: "png" },
    ]);
    const pages = await readPdf(out);
    expect(pages.map((p) => [Math.round(p.width), Math.round(p.height)])).toEqual([
      [360, 240],
      [30, 23],
    ]);
  });

  it("fits images on A4 and picks orientation automatically", async () => {
    const out = await imagesToPdf([{ bytes: fixture("photo.jpg"), type: "jpg" }], {
      pageSize: "a4",
      margin: 20,
    });
    const [page] = await readPdf(out);
    expect(Math.round(page!.width)).toBe(842); // landscape, because the photo is wide
  });

  it("replaces pages with images at their displayed size", async () => {
    const pdf = await makePdf(["keep", { label: "swap", size: [300, 500], rotation: 90 }]);
    const out = await replacePagesWithImages(pdf, [
      { pageIndex: 1, bytes: fixture("red.png"), type: "png" },
    ]);
    const pages = await readPdf(out);
    expect(pages[0]!.text).toBe("keep");
    expect(pages[1]!.text).toBe("");
    expect([pages[1]!.width, pages[1]!.height, pages[1]!.rotation]).toEqual([500, 300, 0]);
  });
});

describe("invertPixels", () => {
  it("inverts RGB and leaves alpha alone", () => {
    const px = new Uint8ClampedArray([0, 128, 255, 10, 255, 255, 255, 255]);
    invertPixels(px);
    expect([...px]).toEqual([255, 127, 0, 10, 0, 0, 0, 255]);
  });
});

describe("stampImage", () => {
  it.each([0, 90, 180, 270])(
    "places the image where the user put it on a page rotated %i°",
    async (rotation) => {
      const pdf = await makePdf([{ label: "x", size: [300, 500], rotation }]);
      const rect = { x: 0.5, y: 0.6, width: 0.25, height: 0.1 };
      const out = await stampImage(pdf, { bytes: fixture("red.png"), type: "png" }, [
        { pageIndex: 0, rect },
      ]);
      const [box] = await imageBoxes(out);
      expect(box!.x).toBeCloseTo(rect.x, 3);
      expect(box!.y).toBeCloseTo(rect.y, 3);
      expect(box!.width).toBeCloseTo(rect.width, 3);
      expect(box!.height).toBeCloseTo(rect.height, 3);
    },
  );

  it("keeps the image's proportions when no height is given", async () => {
    // red.png is 40×30. The page is displayed 500×300 (rotated), so 50% width = 250pt wide,
    // and keeping 4:3 proportions makes it 187.5pt tall.
    const pdf = await makePdf([{ label: "x", size: [300, 500], rotation: 90 }]);
    const out = await stampImage(pdf, { bytes: fixture("red.png"), type: "png" }, [
      { pageIndex: 0, rect: { x: 0.1, y: 0.2, width: 0.5 } },
    ]);
    const [box] = await imageBoxes(out);
    expect(box!.width * 500).toBeCloseTo(250, 1);
    expect(box!.height * 300).toBeCloseTo(187.5, 1);
    expect(box!.y).toBeCloseTo(0.2, 3);
  });
});

describe("addWatermark", () => {
  it.each([0, 90, 180, 270])("centers the text on a page rotated %i°", async (rotation) => {
    const pdf = await makePdf([{ label: "x", size: [300, 500], rotation }]);
    const out = await addWatermark(pdf, { text: "DRAFT", layout: "horizontal" });
    const [page] = await readPdf(out);
    const mark = page!.items.find((i) => i.str === "DRAFT")!;
    // The baseline starts left of center and sits just below it, as displayed.
    expect(mark.x).toBeGreaterThan(page!.width * 0.1);
    expect(mark.x).toBeLessThan(page!.width * 0.5);
    expect(mark.y).toBeGreaterThan(page!.height * 0.5);
    expect(mark.y).toBeLessThan(page!.height * 0.7);
  });

  it("rejects empty and unsupported text", async () => {
    const pdf = await makePdf(["a"]);
    await expect(addWatermark(pdf, { text: "  " })).rejects.toThrow(/Enter some/);
    await expect(addWatermark(pdf, { text: "機密" })).rejects.toThrow(/can't be drawn/);
  });
});

describe("grayscalePixels", () => {
  it("averages by luma and leaves alpha alone", () => {
    const px = new Uint8ClampedArray([255, 0, 0, 10, 255, 255, 255, 255]);
    grayscalePixels(px);
    expect([...px]).toEqual([76, 76, 76, 10, 255, 255, 255, 255]);
  });
});
