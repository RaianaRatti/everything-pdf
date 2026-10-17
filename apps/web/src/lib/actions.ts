import { selectedPages, useWorkspace, type PageItem, type SourceFile } from "../store/workspace";
import { downloadBytes } from "./download";
import { engine } from "./engine";
import { baseName, ensurePdfExtension, isImageFile, isPdfFile, readBytes, uid } from "./files";
import { prepareImage } from "./images";
import { askPassword } from "./password";

/** Turns any thrown value into something safe to show a user. */
export function errorMessage(err: unknown): string {
  // PdfEngineError messages are written for users; Comlink preserves name and message.
  if (err instanceof Error) {
    if (err.name === "PdfEngineError") return err.message;
    return `Something went wrong: ${err.message}`;
  }
  return "Something went wrong.";
}

const state = () => useWorkspace.getState();

/** Runs an async task with the busy overlay up, reporting failures as a notice. */
export async function runTask<T>(message: string, task: () => Promise<T>): Promise<T | undefined> {
  state().setBusy(message);
  try {
    return await task();
  } catch (err) {
    console.error(err);
    state().setNotice({ kind: "error", message: errorMessage(err) });
    return undefined;
  } finally {
    state().setBusy(null);
  }
}

/**
 * Reads a PDF, asking for its password if it's encrypted. Returns null if the user skips it.
 * Throws for unreadable files.
 */
async function openPdfFile(file: File): Promise<SourceFile | null> {
  const bytes = await readBytes(file);
  let password: string | undefined;
  for (;;) {
    const result = await engine.open(bytes, password);
    if (result.status === "ok") {
      const { title, author, subject, keywords } = result.info;
      return {
        id: uid(),
        name: file.name,
        bytes: result.unlocked ?? bytes,
        pageCount: result.pageCount,
        info: { title, author, subject, keywords },
        unlocked: result.unlocked !== null,
      };
    }
    // Hide the busy overlay while the password dialog is up.
    const busy = state().busy;
    state().setBusy(null);
    const answer = await askPassword(file.name, result.wrongPassword);
    state().setBusy(busy);
    if (answer === null) return null;
    password = answer;
  }
}

/**
 * Reads dropped/picked files. PDFs become sources as-is (decrypted if needed); images are
 * converted into a PDF with one page per image, so mixed drops just work. Problems are
 * reported as one notice.
 */
export async function loadFiles(files: File[]): Promise<SourceFile[]> {
  const pdfs = files.filter(isPdfFile);
  const images = files.filter((f) => !isPdfFile(f) && isImageFile(f));
  const skipped = files.filter((f) => !isPdfFile(f) && !isImageFile(f));
  const errors: string[] = skipped.map((f) => `${f.name}: not a PDF or image.`);
  const loaded: SourceFile[] = [];

  await runTask(
    `Loading ${files.length === 1 ? files[0]!.name : `${files.length} files`}…`,
    async () => {
      for (const file of pdfs) {
        try {
          const source = await openPdfFile(file);
          if (source) loaded.push(source);
        } catch (err) {
          errors.push(`${file.name}: ${errorMessage(err)}`);
        }
      }

      if (images.length > 0) {
        const inputs = [];
        for (const file of images) {
          try {
            inputs.push(await prepareImage(file));
          } catch (err) {
            errors.push(`${file.name}: ${errorMessage(err)}`);
          }
        }
        if (inputs.length > 0) {
          const bytes = await engine.imagesToPdf(inputs, { pageSize: "fit" });
          const name = inputs.length === 1 ? `${baseName(images[0]!.name)}.pdf` : "images.pdf";
          loaded.push({ id: uid(), name, bytes, pageCount: inputs.length });
        }
      }
    },
  );

  if (errors.length > 0) state().setNotice({ kind: "error", message: errors.join("\n") });
  return loaded;
}

/** Loads files and appends their pages to the workspace. */
export async function addFiles(files: File[]): Promise<void> {
  state().addFiles(await loadFiles(files));
}

/** Loads files and inserts their pages before position `at`. */
export async function insertFiles(files: File[], at: number): Promise<void> {
  state().insertFiles(await loadFiles(files), at);
}

/** Builds real PDF bytes for the given pages (default: the whole workspace). */
export async function materialize(pages: PageItem[] = state().pages): Promise<Uint8Array> {
  const { files } = state();
  const sources: Record<string, Uint8Array> = {};
  for (const p of pages) sources[p.fileId] ??= files[p.fileId]!.bytes;
  return engine.assemble(
    sources,
    pages.map((p) => ({ source: p.fileId, pageIndex: p.pageIndex, rotation: p.rotation })),
    { info: state().docInfo },
  );
}

/**
 * Runs an operation over the whole document and replaces the workspace with its result, as
 * one undoable step.
 */
export async function applyToDocument(
  message: string,
  operation: (bytes: Uint8Array, pages: PageItem[]) => Promise<Uint8Array>,
  success?: string,
): Promise<boolean> {
  const done = await runTask(message, async () => {
    const pages = state().pages;
    const out = await operation(await materialize(pages), pages);
    const { pageCount } = await engine.inspect(out);
    state().replaceDocument({ id: uid(), name: state().outputName, bytes: out, pageCount });
    return true;
  });
  if (done && success) state().setNotice({ kind: "success", message: success });
  return done ?? false;
}

export async function downloadDocument(): Promise<void> {
  await runTask("Preparing your PDF…", async () => {
    downloadBytes(await materialize(), ensurePdfExtension(state().outputName));
  });
}

export async function downloadSelection(): Promise<void> {
  const pages = selectedPages(state());
  if (pages.length === 0) return;
  await runTask("Extracting pages…", async () => {
    const name = `${baseName(ensurePdfExtension(state().outputName))}-extract.pdf`;
    downloadBytes(await materialize(pages), name);
  });
}
