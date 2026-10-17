import { PDFDocument } from "pdf-lib";
import { PdfEngineError } from "../errors";

/**
 * Encryption and decryption run in qpdf, compiled to WebAssembly. pdf-lib can't read encrypted
 * files or write them, so this is the only path in or out of a password-protected PDF.
 */

interface QpdfInstance {
  callMain(args: string[]): number;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
}

type CreateQpdf = (options: {
  locateFile?: () => string;
  noInitialRun?: boolean;
}) => Promise<QpdfInstance>;

let wasmUrl: string | undefined;

/** In the browser, tell qpdf where its .wasm file is served from. Node finds it on its own. */
export function setQpdfWasmUrl(url: string): void {
  wasmUrl = url;
}

/**
 * Runs qpdf once on /in.pdf with the given arguments (which say where output goes, if any).
 * Returns the exit code and /out.pdf if it was written.
 */
async function execQpdf(
  input: Uint8Array,
  args: string[],
): Promise<{ code: number; output: Uint8Array | null }> {
  const createModule = ((await import("@neslinesli93/qpdf-wasm")) as { default: unknown })
    .default as CreateQpdf;
  // A fresh instance per run: qpdf is a command-line program and expects a clean start.
  const qpdf = await createModule({
    ...(wasmUrl ? { locateFile: () => wasmUrl! } : {}),
    noInitialRun: true,
  });
  qpdf.FS.writeFile("/in.pdf", input);
  let code: number;
  try {
    code = qpdf.callMain(args);
  } catch (err) {
    // Emscripten reports exit() as a thrown ExitStatus.
    const status = (err as { status?: unknown }).status;
    code = typeof status === "number" ? status : 2;
  }
  let output: Uint8Array | null = null;
  try {
    output = qpdf.FS.readFile("/out.pdf");
  } catch {
    // No output file.
  }
  return { code, output };
}

/** Runs a qpdf transformation from /in.pdf to /out.pdf. */
async function runQpdf(input: Uint8Array, args: string[]): Promise<Uint8Array> {
  const { code, output } = await execQpdf(input, [...args, "/in.pdf", "/out.pdf"]);
  // 0 = success, 3 = success with warnings (e.g. a slightly damaged file that qpdf repaired).
  if ((code === 0 || code === 3) && output) return output;
  throw new PdfEngineError("invalid", "This PDF couldn't be processed. It may be damaged.");
}

export interface EncryptOptions {
  /** Needed to open the file. Leave empty to allow opening, but still apply restrictions. */
  userPassword: string;
  /** Needed to change restrictions. A random one is used when empty. */
  ownerPassword: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowEditing: boolean;
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Protects a PDF with AES-256 encryption. */
export async function encryptPdf(bytes: Uint8Array, options: EncryptOptions): Promise<Uint8Array> {
  const restricted = !options.allowPrinting || !options.allowCopying || !options.allowEditing;
  if (!options.userPassword && !restricted) {
    throw new PdfEngineError(
      "bad-input",
      "Set a password, or turn off at least one permission, to protect the file.",
    );
  }
  const owner = options.ownerPassword || randomPassword();
  return runQpdf(bytes, [
    "--encrypt",
    `--user-password=${options.userPassword}`,
    `--owner-password=${owner}`,
    "--bits=256",
    `--print=${options.allowPrinting ? "full" : "none"}`,
    `--extract=${options.allowCopying ? "y" : "n"}`,
    `--modify=${options.allowEditing ? "all" : "none"}`,
    "--",
  ]);
}

/**
 * Removes encryption. The empty password works for files that open without one but carry
 * restrictions (printing, copying…).
 */
export async function decryptPdf(bytes: Uint8Array, password = ""): Promise<Uint8Array> {
  try {
    return await runQpdf(bytes, [`--password=${password}`, "--decrypt"]);
  } catch (err) {
    // qpdf's exit code is the same for a wrong password and a damaged file, so ask pdf-lib,
    // which can read the encryption flag without a password.
    const encrypted = await PDFDocument.load(bytes, { ignoreEncryption: true }).then(
      (doc) => doc.isEncrypted,
      () => false,
    );
    if (encrypted) {
      throw new PdfEngineError(
        "wrong-password",
        password ? "That password isn't right." : "This PDF needs a password to open.",
      );
    }
    throw err;
  }
}
