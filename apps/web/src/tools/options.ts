import type { EncryptOptions } from "@everything-pdf/engine";
import {
  defaultHeaderFooterOptions,
  type HeaderFooterOptions,
  type ResizeOptions,
} from "@everything-pdf/engine/pure";

/** Option defaults and helpers shared by tool panels and batch mode. */

export const defaultResizeOptions: ResizeOptions = { size: "a4", orientation: "auto", margin: 0 };

export type HeaderFooterFieldsValue = Omit<HeaderFooterOptions, "fileName" | "date">;

export const defaultHeaderFooterFields: HeaderFooterFieldsValue = {
  header: defaultHeaderFooterOptions.header,
  footer: defaultHeaderFooterOptions.footer,
  fontSize: defaultHeaderFooterOptions.fontSize,
  margin: defaultHeaderFooterOptions.margin,
  skipFirst: defaultHeaderFooterOptions.skipFirst,
};

/** Today's date as people write it here, for {date} in headers and footers. */
export const today = () =>
  new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export interface ProtectFieldsValue extends EncryptOptions {
  confirm: string;
}

export const defaultProtectFields: ProtectFieldsValue = {
  userPassword: "",
  confirm: "",
  ownerPassword: "",
  allowPrinting: true,
  allowCopying: true,
  allowEditing: true,
};

export function toEncryptOptions(v: ProtectFieldsValue): EncryptOptions {
  return {
    userPassword: v.userPassword,
    ownerPassword: v.ownerPassword,
    allowPrinting: v.allowPrinting,
    allowCopying: v.allowCopying,
    allowEditing: v.allowEditing,
  };
}

/** Why the protect settings can't be used yet, or null if they're fine. */
export function protectProblem(v: ProtectFieldsValue): string | null {
  const restricted = !v.allowPrinting || !v.allowCopying || !v.allowEditing;
  if (!v.userPassword && !restricted) return "Enter a password or restrict something.";
  if (v.userPassword !== v.confirm) return "The passwords don't match.";
  return null;
}
