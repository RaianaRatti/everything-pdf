export type PdfErrorCode = "encrypted" | "wrong-password" | "invalid" | "bad-input";

/** An error with a user-facing message and a machine-readable code. */
export class PdfEngineError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = "PdfEngineError";
    this.code = code;
  }
}
