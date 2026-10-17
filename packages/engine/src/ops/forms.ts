import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFTextField,
  type PDFDocument,
  type PDFForm,
} from "pdf-lib";
import { PdfEngineError } from "../errors";
import { loadPdf } from "../load";

export type FormFieldValue = string | boolean | string[];

export type FormField =
  | { kind: "text"; name: string; value: string; multiline: boolean; readOnly: boolean }
  | { kind: "checkbox"; name: string; value: boolean; readOnly: boolean }
  | { kind: "radio"; name: string; value: string; options: string[]; readOnly: boolean }
  | {
      kind: "choice";
      name: string;
      value: string[];
      options: string[];
      multiple: boolean;
      readOnly: boolean;
    };

function formOf(doc: PDFDocument): PDFForm | null {
  if (!doc.catalog.has(PDFName.of("AcroForm"))) return null;
  try {
    return doc.getForm();
  } catch {
    return null;
  }
}

export function formFieldCount(doc: PDFDocument): number {
  return formOf(doc)?.getFields().length ?? 0;
}

/** Lists fillable fields (buttons and signature fields are left out). */
export async function readFormFields(bytes: Uint8Array): Promise<FormField[]> {
  const form = formOf(await loadPdf(bytes));
  if (!form) return [];
  const fields: FormField[] = [];
  for (const field of form.getFields()) {
    const name = field.getName();
    const readOnly = field.isReadOnly();
    try {
      if (field instanceof PDFTextField) {
        fields.push({
          kind: "text",
          name,
          value: field.getText() ?? "",
          multiline: field.isMultiline(),
          readOnly,
        });
      } else if (field instanceof PDFCheckBox) {
        fields.push({ kind: "checkbox", name, value: field.isChecked(), readOnly });
      } else if (field instanceof PDFRadioGroup) {
        fields.push({
          kind: "radio",
          name,
          value: field.getSelected() ?? "",
          options: field.getOptions(),
          readOnly,
        });
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        fields.push({
          kind: "choice",
          name,
          value: field.getSelected(),
          options: field.getOptions(),
          multiple: field instanceof PDFOptionList || field.isMultiselect(),
          readOnly,
        });
      }
    } catch {
      // A malformed field shouldn't hide the rest of the form.
    }
  }
  return fields;
}

/**
 * Fills fields by name. With `flatten`, the values become part of the page and the form can no
 * longer be edited.
 */
export async function fillForm(
  bytes: Uint8Array,
  values: Record<string, FormFieldValue>,
  { flatten = false }: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const form = formOf(doc);
  if (!form) throw new PdfEngineError("bad-input", "This PDF doesn't have a form to fill.");

  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    try {
      if (field instanceof PDFTextField && typeof value === "string") {
        field.setText(value || undefined);
      } else if (field instanceof PDFCheckBox && typeof value === "boolean") {
        if (value) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup && typeof value === "string") {
        if (value) field.select(value);
        else field.clear();
      } else if (
        (field instanceof PDFDropdown || field instanceof PDFOptionList) &&
        Array.isArray(value)
      ) {
        if (value.length) field.select(value);
        else field.clear();
      }
    } catch (err) {
      throw new PdfEngineError(
        "bad-input",
        `Couldn't fill “${name}”: ${err instanceof Error ? err.message : "invalid value"}.`,
      );
    }
  }

  try {
    if (flatten) form.flatten();
    return await doc.save({ useObjectStreams: true });
  } catch {
    throw new PdfEngineError(
      "bad-input",
      "Some of the text can't be drawn in this form's font. Use Latin letters, numbers and punctuation.",
    );
  }
}

const Annots = PDFName.of("Annots");
const Subtype = PDFName.of("Subtype");

export interface RemoveAnnotationsOptions {
  /** Also remove links. */
  links: boolean;
  /** Also remove form fields (their current values disappear too). */
  forms: boolean;
}

/**
 * Removes comments and markup (highlights, notes, drawings, stamps…). Returns how many
 * annotations were removed.
 */
export async function removeAnnotations(
  bytes: Uint8Array,
  options: RemoveAnnotationsOptions,
): Promise<{ bytes: Uint8Array; removed: number }> {
  const doc = await loadPdf(bytes);
  let removed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(Annots, PDFArray);
    if (!annots) continue;
    const kept = annots.asArray().filter((ref) => {
      const dict = ref instanceof PDFRef ? doc.context.lookupMaybe(ref, PDFDict) : ref;
      const subtype = dict instanceof PDFDict ? dict.get(Subtype)?.toString() : undefined;
      const keep =
        (subtype === "/Link" && !options.links) || (subtype === "/Widget" && !options.forms);
      if (!keep) removed++;
      return keep;
    });
    if (kept.length) page.node.set(Annots, doc.context.obj(kept));
    else page.node.delete(Annots);
  }
  if (options.forms) doc.catalog.delete(PDFName.of("AcroForm"));
  return { bytes: await doc.save({ useObjectStreams: true }), removed };
}
