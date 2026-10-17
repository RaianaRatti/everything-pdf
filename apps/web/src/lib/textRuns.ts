import type { TextRun } from "@everything-pdf/engine/pure";
import type { PageItem, SourceFile } from "../store/workspace";
import { openPdf } from "./pdfjs";

/**
 * The text on a page as runs with boxes, in fractions of the page as displayed (origin
 * top-left), matching how pages are shown and rendered.
 */
export async function textRuns(
  page: PageItem,
  files: Record<string, SourceFile>,
): Promise<TextRun[]> {
  const file = files[page.fileId]!;
  const doc = await openPdf(file.id, file.bytes);
  const pdfPage = await doc.getPage(page.pageIndex + 1);
  const viewport = pdfPage.getViewport({
    scale: 1,
    rotation: (pdfPage.rotate + page.rotation) % 360,
  });
  const content = await pdfPage.getTextContent();
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    // Unit vectors along and across the text, in page space.
    const along = Math.hypot(a!, b!) || 1;
    const across = Math.hypot(c!, d!) || 1;
    const dir = [a! / along, b! / along];
    const up = [c! / across, d! / across];
    const height = item.height || across;
    // From a little below the baseline (descenders) to the top of the line.
    const base = [e! - up[0]! * height * 0.25, f! - up[1]! * height * 0.25];
    const corners = [
      base,
      [base[0]! + dir[0]! * item.width, base[1]! + dir[1]! * item.width],
      [
        base[0]! + dir[0]! * item.width + up[0]! * height * 1.25,
        base[1]! + dir[1]! * item.width + up[1]! * height * 1.25,
      ],
      [base[0]! + up[0]! * height * 1.25, base[1]! + up[1]! * height * 1.25],
    ].map(([x, y]) => viewport.convertToViewportPoint(x!, y!) as [number, number]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Direction of the text on screen: horizontal if the baseline moves mostly sideways.
    const [sx, sy] = viewport.convertToViewportPoint(e!, f!) as [number, number];
    const [tx, ty] = viewport.convertToViewportPoint(e! + dir[0]!, f! + dir[1]!) as [
      number,
      number,
    ];
    const leftToRight = tx - sx > Math.abs(ty - sy);
    runs.push({
      text: item.str,
      x: x0 / viewport.width,
      y: y0 / viewport.height,
      width: (x1 - x0) / viewport.width,
      height: (y1 - y0) / viewport.height,
      vertical: !leftToRight || undefined,
    });
  }
  pdfPage.cleanup();
  return runs;
}
