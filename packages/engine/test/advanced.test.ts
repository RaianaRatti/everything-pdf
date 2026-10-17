import forge from "node-forge";
import { PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, rgb } from "pdf-lib";
import { OPS, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  REDACTION_PATTERNS,
  applyEdits,
  applyHomography,
  assemble,
  booklet,
  bookletOrder,
  compress,
  detectDocument,
  enhanceScan,
  diffWords,
  findMatches,
  homography,
  inspect,
  keepOutside,
  linearizePdf,
  literalPattern,
  nUp,
  optimizeStructure,
  poster,
  readFormFields,
  recolorPdf,
  redactPages,
  repairPdf,
  signPdfDigitally,
  splitSpreads,
  verifySignatures,
  warpPerspective,
  type ImageCodec,
  type Quad,
  type TextRun,
} from "../src";
import { parseContent } from "../src/content";
import { annotations, fixture, makeFormPdf, makePdf, readPdf, texts } from "./helpers";

/** Fill colors used on page 1, as pdf.js reports them ("#rrggbb"). */
async function fillColors(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const ops = await (await pdf.getPage(1)).getOperatorList();
  return ops.fnArray.flatMap((fn, i) =>
    fn === OPS.setFillRGBColor ? [ops.argsArray[i]![0] as string] : [],
  );
}

/** All decoded stream contents in the file, to check nothing secret survives anywhere. */
function allStreamText(bytes: Uint8Array, doc: PDFDocument): string {
  let out = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        out += Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
      } catch {
        out += Buffer.from(obj.contents).toString("latin1");
      }
    }
  }
  return out + Buffer.from(bytes).toString("latin1");
}

describe("content stream parser", () => {
  it("splits operations and keeps strings, arrays and inline images intact", () => {
    const s =
      "q 1 0 0 1 10 20 cm BT /F1 12 Tf [(a\\)b) -20 <0041>] TJ ET BI /W 1 /H 1 ID \x00EI\x01 EI Q";
    const ops = parseContent(s).map((o) => o.operator);
    expect(ops).toEqual(["q", "cm", "BT", "Tf", "TJ", "ET", "BI", "Q"]);
    const tj = parseContent(s).find((o) => o.operator === "TJ")!;
    expect(s.slice(tj.start, tj.end)).toBe("[(a\\)b) -20 <0041>] TJ");
  });
});

describe("recolorPdf", () => {
  it("inverts colors, adds a dark background and keeps text as text", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([300, 300]);
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(1, 0, 0) });
    page.drawText("Dark mode", { x: 20, y: 200, size: 20, font, color: rgb(0, 0, 0) });
    const out = await recolorPdf(await doc.save(), { mode: "invert", keepImages: false });
    // Background (black), default ink (white), the rectangle's red → cyan, the text's black → white.
    expect(await fillColors(out)).toEqual(["#000000", "#ffffff", "#00ffff", "#ffffff"]);
    expect(await texts(out)).toEqual(["Dark mode"]);
  });

  it("smart mode keeps hue and leaves images alone", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(0.8, 0, 0) });
    const image = await doc.embedPng(fixture("red.png"));
    page.drawImage(image, { x: 100, y: 100, width: 40, height: 30 });
    const out = await recolorPdf(await doc.save(), { mode: "smart", keepImages: true });
    const colors = await fillColors(out);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colors[2]!.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g! + 50); // still red
    expect(g).toBe(b);
    const reloaded = await PDFDocument.load(out);
    const decode = [...reloaded.context.enumerateIndirectObjects()].some(
      ([, o]) => o instanceof PDFRawStream && o.dict.toString().includes("/Decode"),
    );
    expect(decode).toBe(false);
  });

  it("inverts images through their Decode array in invert mode", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    page.drawImage(await doc.embedJpg(fixture("photo.jpg")), {
      x: 0,
      y: 0,
      width: 100,
      height: 60,
    });
    const out = await PDFDocument.load(
      await recolorPdf(await doc.save(), { mode: "invert", keepImages: false }),
    );
    const image = [...out.context.enumerateIndirectObjects()].find(
      ([, o]) => o instanceof PDFRawStream && o.dict.toString().includes("/Subtype /Image"),
    )![1] as PDFRawStream;
    expect(image.dict.toString()).toContain("/Decode [ 1 0 1 0 1 0 ]");
  });
});

describe("redaction", () => {
  const runs: TextRun[] = [
    { text: "Contact: ada@example.com today", x: 0.1, y: 0.1, width: 0.6, height: 0.02 },
    { text: "Call 555-123-4567", x: 0.1, y: 0.2, width: 0.34, height: 0.02 },
  ];

  it("finds patterns and literal text, as boxes over the matching characters", () => {
    const emails = findMatches(runs, REDACTION_PATTERNS.email.regex);
    expect(emails).toHaveLength(1);
    // Covers the address plus a character of margin on each side.
    expect(emails[0]!.x).toBeGreaterThan(0.1 + 0.6 * (7 / 30));
    expect(emails[0]!.x + emails[0]!.width).toBeLessThan(0.1 + 0.6 * (27 / 30));
    expect(findMatches(runs, literalPattern("CALL"))).toHaveLength(1);
    expect(findMatches(runs, REDACTION_PATTERNS.phone.regex)).toHaveLength(1);
  });

  it("keeps the text around a redaction searchable", () => {
    const boxes = findMatches(runs, REDACTION_PATTERNS.email.regex);
    const kept = keepOutside(runs, boxes).map((r) => r.text.trim());
    expect(kept).toEqual(["Contact:", "today", "Call 555-123-4567"]);
  });

  it("leaves no trace of redacted text or fields anywhere in the file", async () => {
    const doc = await PDFDocument.load(await makeFormPdf());
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText("SECRET-PLAN", { x: 20, y: 380, size: 12, font });
    doc.getForm().getTextField("name").setText("hidden-name");
    const pdf = await doc.save();

    const out = await redactPages(pdf, [
      {
        pageIndex: 0,
        bytes: fixture("red.png"),
        type: "png",
        words: [{ text: "visible", x: 0.1, y: 0.5, width: 0.2, height: 0.03 }],
      },
    ]);
    const reloaded = await PDFDocument.load(out);
    const everything = allStreamText(out, reloaded);
    expect(everything).not.toContain("SECRET-PLAN");
    expect(everything).not.toContain("hidden-name");
    expect((await texts(out))[0]).toBe("visible");
    expect(await readFormFields(out)).toEqual([]);
    expect(await texts(out)).toHaveLength(2);
  });
});

describe("layout", () => {
  it("puts 4 pages per sheet", async () => {
    const out = await nUp(await makePdf(["a", "b", "c", "d", "e"]), {
      perSheet: 4,
      size: "a4",
      margin: 20,
      gap: 10,
      borders: false,
    });
    const pages = await readPdf(out);
    expect(pages.map((p) => p.text)).toEqual(["a b c d", "e"]);
    const [a, b, c] = pages[0]!.items;
    expect(b!.x).toBeGreaterThan(a!.x); // b right of a
    expect(c!.y).toBeGreaterThan(a!.y); // c below a
  });

  it("orders booklet pages for folding", () => {
    expect(bookletOrder(8)).toEqual([
      [7, 0],
      [1, 6],
      [5, 2],
      [3, 4],
    ]);
    expect(bookletOrder(5)).toHaveLength(4); // padded to 8
  });

  it("makes a booklet with blank padding", async () => {
    const out = await booklet(await makePdf(["1", "2", "3", "4", "5", "6"]), {
      size: "a4",
      margin: 10,
    });
    expect(await texts(out)).toEqual(["1", "2", "6 3", "4 5"]);
  });

  it("tiles a page into a poster", async () => {
    const out = await poster(await makePdf([{ label: "big", size: [300, 400] }]), {
      pageIndex: 0,
      columns: 2,
      rows: 2,
      size: "a4",
      overlap: 20,
    });
    expect((await readPdf(out)).length).toBe(4);
  });

  it("splits spreads into halves, keeping text", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([600, 400]);
    page.drawText("LEFT", { x: 50, y: 200, size: 20, font });
    page.drawText("RIGHT", { x: 400, y: 200, size: 20, font });
    const out = await splitSpreads(await doc.save(), { direction: "vertical" });
    const pages = await readPdf(out);
    expect(pages.map((p) => [p.text, Math.round(p.width), Math.round(p.height)])).toEqual([
      ["LEFT", 300, 400],
      ["RIGHT", 300, 400],
    ]);
    const rtl = await readPdf(
      await splitSpreads(await doc.save(), { direction: "vertical", rightToLeft: true }),
    );
    expect(rtl.map((p) => p.text)).toEqual(["RIGHT", "LEFT"]);
  });

  it("splits along the displayed width of a rotated page", async () => {
    const doc = await PDFDocument.load(
      await makePdf([{ label: "x", size: [400, 600], rotation: 90 }]),
    );
    // Displayed 600 wide × 400 tall; each half is 300 × 400 as displayed.
    const pages = await readPdf(await splitSpreads(await doc.save(), { direction: "vertical" }));
    expect(pages.map((p) => [Math.round(p.width), Math.round(p.height)])).toEqual([
      [300, 400],
      [300, 400],
    ]);
  });
});

describe("bookmarks and links", () => {
  async function withOutline(): Promise<Uint8Array> {
    const pdf = await makePdf(["one", "two", "three"]);
    const doc = await PDFDocument.load(pdf);
    const { writeOutline } = await import("../src/outline");
    writeOutline(doc, [
      { title: "Intro", pageIndex: 0, level: 0 },
      { title: "Detail", pageIndex: 1, level: 1 },
      { title: "End", pageIndex: 2, level: 0 },
    ]);
    return doc.save();
  }

  it("reads bookmarks and writes them through assemble", async () => {
    const pdf = await withOutline();
    expect((await inspect(pdf)).outline).toEqual([
      { title: "Intro", pageIndex: 0, level: 0 },
      { title: "Detail", pageIndex: 1, level: 1 },
      { title: "End", pageIndex: 2, level: 0 },
    ]);
    const out = await assemble(
      { a: pdf },
      [2, 0, 1].map((pageIndex) => ({ source: "a", pageIndex })),
      {
        outline: [{ title: "Moved", pageIndex: 1, level: 0 }],
      },
    );
    expect((await inspect(out)).outline).toEqual([{ title: "Moved", pageIndex: 1, level: 0 }]);
  });

  it("keeps links to other pages working after reordering, and drops dead ones", async () => {
    const box = { x: 0.1, y: 0.1, width: 0.2, height: 0.05 };
    const pdf = await applyEdits(await makePdf(["one", "two", "three"]), [
      {
        pageIndex: 0,
        objects: [
          { kind: "link", box, pageIndex: 2 },
          { kind: "link", box, pageIndex: 1 },
          { kind: "link", box, url: "example.com" },
        ],
      },
    ]);
    // Page order: three, one (page "two" dropped).
    const out = await assemble({ a: pdf }, [
      { source: "a", pageIndex: 2 },
      { source: "a", pageIndex: 0 },
    ]);
    const doc = await getDocument({ data: out.slice(), verbosity: 0 }).promise;
    const links = await (await doc.getPage(2)).getAnnotations();
    expect(links).toHaveLength(2);
    expect(links[0].url).toBeUndefined();
    expect(await doc.getPageIndex(links[0].dest[0])).toBe(0);
    expect(links[1].url).toBe("https://example.com/");
    // No stray page objects were copied along.
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("creates form fields", async () => {
    const box = { x: 0.1, y: 0.1, width: 0.3, height: 0.05 };
    const out = await applyEdits(await makePdf(["x"]), [
      {
        pageIndex: 0,
        objects: [
          { kind: "field", box, field: "text", name: "email" },
          { kind: "field", box, field: "text", name: "email" },
          { kind: "field", box, field: "checkbox", name: "ok" },
          { kind: "field", box, field: "dropdown", name: "size", options: ["S", "M"] },
        ],
      },
    ]);
    expect((await readFormFields(out)).map((f) => [f.kind, f.name])).toEqual([
      ["text", "email"],
      ["text", "email_2"],
      ["checkbox", "ok"],
      ["choice", "size"],
    ]);
    expect((await annotations(out))[0]).toHaveLength(4);
  });
});

describe("qpdf tools", () => {
  it.each([
    [
      "a wrong cross-reference offset",
      (t: string) => t.replace(/startxref\s+\d+/, "startxref\n100"),
    ],
    ["no cross-reference table", (t: string) => t.replace(/xref[\s\S]*?trailer/, "trailer")],
    ["shifted objects", (t: string) => t.replace("%PDF-1.7", "%PDF-1.7\n% junk shifting offsets")],
  ])("repairs a file with %s", async (_, damage) => {
    // A classic (uncompressed cross-reference) file, as damaged files usually are.
    const healthy = await (
      await PDFDocument.load(await makePdf(["fix me"]))
    ).save({ useObjectStreams: false });
    const broken = new Uint8Array(
      Buffer.from(damage(Buffer.from(healthy).toString("latin1")), "latin1"),
    );
    const repaired = await repairPdf(broken);
    expect(await texts(repaired)).toEqual(["fix me"]);
    // The result is clean enough for qpdf, which is strict.
    expect(await texts(await optimizeStructure(repaired))).toEqual(["fix me"]);
  });

  it("linearizes and optimizes without changing content", async () => {
    const pdf = await makePdf(["a", "b"]);
    const linear = await linearizePdf(pdf);
    expect(Buffer.from(linear.subarray(0, 1024)).toString("latin1")).toContain("/Linearized");
    expect(await texts(await optimizeStructure(pdf))).toEqual(["a", "b"]);
  });

  it("re-encodes losslessly stored photos as JPEG when it helps", async () => {
    const doc = await PDFDocument.create();
    // A noisy 300×300 image: photo-like (many colors), stored losslessly by embedPng.
    const { encodePng } = await import("../src/png");
    let seed = 1;
    const pixels = new Uint8Array(300 * 300 * 3).map(
      () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24,
    );
    const image = await doc.embedPng(encodePng(pixels, 300, 300, 3));
    doc.addPage([300, 300]).drawImage(image, { x: 0, y: 0, width: 300, height: 300 });
    const pdf = await doc.save();
    const jpeg = fixture("small.jpg");
    const codec: ImageCodec = {
      reencodeJpeg: async () => null,
      encodeJpeg: async () => ({ bytes: jpeg, width: 20, height: 20 }),
    };
    const result = await compress(pdf, { quality: 0.7, maxDimension: 2000 }, codec);
    expect(result.imagesRecompressed).toBe(1);
    expect(result.newSize).toBeLessThan(result.originalSize / 4);
    const lossless = await compress(pdf, { quality: 1, maxDimension: 1e9, images: false }, codec);
    expect(lossless.imagesRecompressed).toBe(0);
  });
});

describe("digital signatures", () => {
  // One self-signed RSA identity for all tests (key generation is slow in pure JS).
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [{ name: "commonName", value: "Ada Lovelace" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Der = forge.asn1
    .toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "pw", { algorithm: "3des" }))
    .getBytes();
  const p12 = new Uint8Array(Buffer.from(p12Der, "binary"));

  it("signs, and the signature verifies", async () => {
    const signed = await signPdfDigitally(await makePdf(["contract"]), {
      p12,
      password: "pw",
      reason: "Approved",
      appearance: { pageIndex: 0, box: { x: 0.5, y: 0.8, width: 0.45, height: 0.12 } },
    });
    const [report] = await verifySignatures(signed);
    expect(report).toMatchObject({
      signer: "Ada Lovelace",
      issuer: "Ada Lovelace",
      selfSigned: true,
      reason: "Approved",
      intact: true,
      validSignature: true,
      coversWholeFile: true,
      certificateValidAtSigning: true,
    });
    expect((await texts(signed))[0]).toContain("Digitally signed by Ada Lovelace");
  });

  it("detects tampering", async () => {
    const signed = await signPdfDigitally(await makePdf(["contract"]), { p12, password: "pw" });
    const tampered = signed.slice();
    tampered[7] = tampered[7] === 0x37 ? 0x36 : 0x37; // the version digit in "%PDF-1.x", which is signed
    const [report] = await verifySignatures(tampered);
    expect(report!.intact).toBe(false);
  });

  it("reports content added after signing", async () => {
    const signed = await signPdfDigitally(await makePdf(["contract"]), { p12, password: "pw" });
    const appended = new Uint8Array([...signed, ...Buffer.from("\n% appended\n")]);
    const [report] = await verifySignatures(appended);
    expect(report).toMatchObject({ intact: true, validSignature: true, coversWholeFile: false });
  });

  it("rejects a wrong certificate password", async () => {
    await expect(
      signPdfDigitally(await makePdf(["x"]), { p12, password: "nope" }),
    ).rejects.toMatchObject({ code: "wrong-password" });
  });
});

describe("scan geometry", () => {
  it("finds a bright sheet on a dark background", () => {
    const w = 200;
    const h = 160;
    const gray = new Uint8Array(w * h).fill(40);
    const corners: Quad = [
      { x: 40, y: 30 },
      { x: 160, y: 20 },
      { x: 170, y: 140 },
      { x: 30, y: 130 },
    ];
    // Fill the quad: a point is inside if it's left of every edge (clockwise).
    const inside = (x: number, y: number) =>
      corners.every((a, i) => {
        const b = corners[(i + 1) % 4]!;
        return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
      });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) gray[y * w + x] = 230;
    const found = detectDocument(gray, w, h)!;
    found.forEach((p, i) => {
      expect(Math.abs(p.x - corners[i]!.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(p.y - corners[i]!.y)).toBeLessThanOrEqual(2);
    });
  });

  it("maps corners exactly and flattens an image", () => {
    const quad: Quad = [
      { x: 10, y: 5 },
      { x: 90, y: 15 },
      { x: 95, y: 95 },
      { x: 5, y: 85 },
    ];
    const rect: Quad = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 70 },
      { x: 0, y: 70 },
    ];
    const h = homography(quad, rect);
    quad.forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q.x).toBeCloseTo(rect[i]!.x, 6);
      expect(q.y).toBeCloseTo(rect[i]!.y, 6);
    });
    // A source image that's white inside the quad region and black outside stays white.
    const src = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    const out = warpPerspective(src, 100, 100, quad, 50, 70);
    expect(out.length).toBe(50 * 70 * 4);
    expect(out[0]).toBe(255);
  });
});

describe("diffWords", () => {
  it("marks added and removed words", () => {
    expect(diffWords("the quick brown fox", "the slow brown dog jumps")).toEqual([
      { type: "same", text: "the" },
      { type: "removed", text: "quick" },
      { type: "added", text: "slow" },
      { type: "same", text: "brown" },
      { type: "removed", text: "fox" },
      { type: "added", text: "dog jumps" },
    ]);
    expect(diffWords("same text", "same  text")).toEqual([{ type: "same", text: "same text" }]);
    expect(diffWords("", "new")).toEqual([{ type: "added", text: "new" }]);
  });
});

describe("redaction on rotated text", () => {
  it("covers and drops whole vertical runs", () => {
    const run = { text: "secret code", x: 0.5, y: 0.1, width: 0.02, height: 0.3, vertical: true };
    const [box] = findMatches([run], literalPattern("code"));
    expect(box!.y).toBeLessThanOrEqual(run.y);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(run.y + run.height);
    expect(keepOutside([run], [box!])).toEqual([]);
  });
});

describe("enhanceScan", () => {
  /** Mostly warm paper with a little dark ink, like a photographed page. */
  function photo(): Uint8ClampedArray {
    const px = new Uint8ClampedArray(100 * 100 * 4);
    for (let i = 0; i < 10_000; i++) {
      const ink = i % 50 === 0;
      px.set(ink ? [50, 45, 40, 255] : [235, 222, 200, 255], i * 4);
    }
    return px;
  }

  it("turns paper white and ink black, removing the color cast", () => {
    const px = photo();
    enhanceScan(px, "color");
    expect(Array.from(px.slice(4, 7))).toEqual([255, 255, 255]); // paper
    expect(Math.max(...px.slice(0, 3))).toBeLessThan(20); // ink
  });

  it("makes gray and black-and-white versions", () => {
    const gray = photo();
    enhanceScan(gray, "gray");
    expect(gray[4]).toBe(gray[5]);
    expect(gray[4]).toBe(255);
    const bw = photo();
    enhanceScan(bw, "bw");
    expect(new Set(bw.filter((_, i) => i % 4 !== 3))).toEqual(new Set([0, 255]));
  });
});
