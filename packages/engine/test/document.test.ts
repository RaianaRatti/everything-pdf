import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  applyEdits,
  assemble,
  decryptPdf,
  encryptPdf,
  extractImages,
  fillForm,
  hasMetadata,
  imagesToPdf,
  inspect,
  inspectDetails,
  readFormFields,
  removeAnnotations,
  stampImage,
} from "../src";
import { annotations, fixture, makeFormPdf, makePdf, texts } from "./helpers";

describe("forms", () => {
  it("lists fields with their types and options", async () => {
    const fields = await readFormFields(await makeFormPdf());
    expect(fields.map((f) => [f.kind, f.name])).toEqual([
      ["text", "name"],
      ["checkbox", "agree"],
      ["choice", "color"],
      ["radio", "size"],
    ]);
    expect(fields.find((f) => f.name === "color")).toMatchObject({
      options: ["Red", "Green", "Blue"],
    });
  });

  it("fills fields and reads them back", async () => {
    const out = await fillForm(await makeFormPdf(), {
      name: "Ada Lovelace",
      agree: true,
      color: ["Green"],
      size: "L",
    });
    const values = Object.fromEntries((await readFormFields(out)).map((f) => [f.name, f.value]));
    expect(values).toEqual({ name: "Ada Lovelace", agree: true, color: ["Green"], size: "L" });
  });

  it("flattening turns values into page content and removes the fields", async () => {
    const out = await fillForm(await makeFormPdf(), { name: "Ada" }, { flatten: true });
    expect(await readFormFields(out)).toEqual([]);
    expect((await texts(out))[0]).toContain("Ada");
  });

  it("survives being rebuilt by assemble (reorder, merge)", async () => {
    const form = await makeFormPdf();
    const other = await makePdf(["other"]);
    const out = await assemble({ form, other }, [
      { source: "other", pageIndex: 0 },
      { source: "form", pageIndex: 1 },
      { source: "form", pageIndex: 0 },
    ]);
    expect((await readFormFields(out)).map((f) => f.name)).toEqual([
      "name",
      "agree",
      "color",
      "size",
    ]);
    const filled = await fillForm(out, { name: "Still works" });
    expect((await readFormFields(filled))[0]!.value).toBe("Still works");
  });
});

describe("removeAnnotations", () => {
  it("removes markup but keeps form fields unless asked", async () => {
    const box = { x: 0.1, y: 0.1, width: 0.2, height: 0.05 };
    const pdf = await applyEdits(await makeFormPdf(), [
      {
        pageIndex: 0,
        objects: [
          { kind: "highlight", box, color: [1, 1, 0] },
          { kind: "note", box, text: "hi", color: [1, 1, 0] },
        ],
      },
    ]);
    const markupOnly = await removeAnnotations(pdf, { links: false, forms: false });
    expect(markupOnly.removed).toBe(2);
    expect((await annotations(markupOnly.bytes))[0]!.every((a) => a.subtype === "Widget")).toBe(
      true,
    );

    const everything = await removeAnnotations(pdf, { links: true, forms: true });
    expect((await annotations(everything.bytes))[0]).toEqual([]);
    expect(await readFormFields(everything.bytes)).toEqual([]);
  });
});

describe("metadata", () => {
  it("writes the given document properties on assemble", async () => {
    const a = await makePdf(["a"]);
    const out = await assemble({ a }, [{ source: "a", pageIndex: 0 }], {
      info: { title: "Annual report", author: "Ada", subject: "", keywords: "money, plans" },
    });
    const { info } = await inspect(out);
    expect(info).toMatchObject({ title: "Annual report", author: "Ada", keywords: "money plans" });
  });

  it("removes all metadata, including XMP on pages", async () => {
    const doc = await PDFDocument.load(await makePdf(["a"]));
    doc.setTitle("Secret title");
    doc
      .getPage(0)
      .node.set(
        doc.context.obj("Metadata") as never,
        doc.context.register(doc.context.stream("<x:xmpmeta/>")),
      );
    const a = await doc.save();
    const out = await assemble({ a }, [{ source: "a", pageIndex: 0 }], { info: null });
    expect(hasMetadata(await PDFDocument.load(out, { updateMetadata: false }))).toBe(false);
    expect((await inspect(out)).info.title).toBe("");
    expect(await texts(out)).toEqual(["a"]);
  });
});

describe("inspectDetails", () => {
  it("summarizes pages, fonts, images, annotations and fields", async () => {
    const withImage = await stampImage(
      await makeFormPdf(),
      { bytes: fixture("red.png"), type: "png" },
      [{ pageIndex: 1, rect: { x: 0, y: 0, width: 0.2 } }],
    );
    const details = await inspectDetails(withImage);
    expect(details).toMatchObject({
      pageCount: 2,
      pageSizes: [{ width: 400, height: 400, count: 2 }],
      imageCount: 1,
      formFields: 4,
      attachments: 0,
      hasJavaScript: false,
    });
    expect(details.fonts).toContain("Helvetica");
    expect(details.annotations.Widget).toBe(5);
    expect(details.version).toMatch(/^\d\.\d$/);
  });
});

describe("extractImages", () => {
  it("returns JPEGs as stored and other images as PNG with transparency", async () => {
    const pdf = await imagesToPdf([
      { bytes: fixture("photo.jpg"), type: "jpg" },
      { bytes: fixture("red.png"), type: "png" },
      { bytes: fixture("photo.jpg"), type: "jpg" },
    ]);
    const { images, skipped } = await extractImages(pdf);
    expect(skipped).toBe(0);
    expect(images.map((i) => [i.page, i.ext, i.width, i.height])).toEqual([
      [1, "jpg", 480, 320],
      [2, "png", 40, 30],
      [3, "jpg", 480, 320],
    ]);
    expect(images[0]!.bytes).toEqual(fixture("photo.jpg"));

    // The PNG is valid and the same size: embedding it again round-trips.
    const check = await PDFDocument.create();
    const png = await check.embedPng(images[1]!.bytes);
    expect([png.width, png.height]).toEqual([40, 30]);
  });

  it("lists an image once even when several pages use it", async () => {
    const one = await stampImage(
      await makePdf(["a", "b"]),
      { bytes: fixture("red.png"), type: "png" },
      [
        { pageIndex: 0, rect: { x: 0, y: 0, width: 0.2 } },
        { pageIndex: 1, rect: { x: 0, y: 0, width: 0.2 } },
      ],
    );
    expect((await extractImages(one)).images).toHaveLength(1);
  });
});

describe("security", () => {
  it("encrypts with a password and decrypts with the same password", async () => {
    const pdf = await makePdf(["secret"]);
    const locked = await encryptPdf(pdf, {
      userPassword: "open sesame",
      ownerPassword: "",
      allowPrinting: true,
      allowCopying: true,
      allowEditing: true,
    });
    await expect(inspect(locked)).rejects.toMatchObject({ code: "encrypted" });
    await expect(decryptPdf(locked, "wrong")).rejects.toMatchObject({ code: "wrong-password" });
    expect(await texts(await decryptPdf(locked, "open sesame"))).toEqual(["secret"]);
  });

  it("applies restrictions without an open password, which the empty password removes", async () => {
    const locked = await encryptPdf(await makePdf(["x"]), {
      userPassword: "",
      ownerPassword: "",
      allowPrinting: false,
      allowCopying: false,
      allowEditing: true,
    });
    await expect(inspect(locked)).rejects.toMatchObject({ code: "encrypted" });
    expect(await texts(await decryptPdf(locked))).toEqual(["x"]);
  });

  it("refuses to 'protect' with no password and no restrictions", async () => {
    await expect(
      encryptPdf(await makePdf(["x"]), {
        userPassword: "",
        ownerPassword: "",
        allowPrinting: true,
        allowCopying: true,
        allowEditing: true,
      }),
    ).rejects.toMatchObject({ code: "bad-input" });
  });
});
