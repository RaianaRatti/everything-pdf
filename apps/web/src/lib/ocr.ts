import type { OcrWord } from "@everything-pdf/engine";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import type { PageItem, SourceFile } from "../store/workspace";
import { openPdf, renderPage } from "./pdfjs";

/** Scans are recognized at 300 DPI, the resolution Tesseract is tuned for. */
const OCR_DPI = 300;

/**
 * Recognizes the words on each page with Tesseract (in its own worker). Word boxes come back as
 * fractions of the page as displayed. Tesseract's engine and language data download from a CDN
 * on first use; the page images never leave the device.
 */
export async function recognizePages(
  pages: PageItem[],
  files: Record<string, SourceFile>,
  language: string,
  onProgress: (message: string) => void,
): Promise<OcrWord[][]> {
  onProgress("Loading OCR engine…");
  const { createWorker } = await import("tesseract.js");
  let current = 0;
  const worker = await createWorker(language, undefined, {
    workerPath,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        onProgress(
          `Reading page ${current + 1} of ${pages.length}… ${Math.round(m.progress * 100)}%`,
        );
      } else if (current === 0 && m.status.startsWith("loading")) {
        onProgress(`Loading OCR engine… ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  try {
    const results: OcrWord[][] = [];
    for (const [i, page] of pages.entries()) {
      current = i;
      onProgress(`Reading page ${i + 1} of ${pages.length}…`);
      const file = files[page.fileId]!;
      const canvas = await renderPage(await openPdf(file.id, file.bytes), page.pageIndex, {
        rotation: page.rotation,
        scale: OCR_DPI / 72,
      });
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              if (!word.text.trim() || word.confidence < 20) continue;
              const { x0, y0, x1, y1 } = word.bbox;
              words.push({
                text: word.text,
                x: x0 / canvas.width,
                y: y0 / canvas.height,
                width: (x1 - x0) / canvas.width,
                height: (y1 - y0) / canvas.height,
              });
            }
          }
        }
      }
      canvas.width = canvas.height = 0;
      results.push(words);
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
