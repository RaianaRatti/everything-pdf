import type { PDFPage } from "pdf-lib";

/**
 * Pages can carry a /Rotate value, so what a viewer shows ("visual" space) differs from the
 * page's own coordinate system. These helpers convert visual positions to page coordinates so
 * that drawn content appears upright and where the user expects it.
 */

export interface VisualFrame {
  /** Rotation of the page as displayed, clockwise, normalized to 0/90/180/270. */
  rotation: 0 | 90 | 180 | 270;
  /** Width and height as displayed (swapped for 90/270). */
  width: number;
  height: number;
}

export function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

export function visualFrame(page: PDFPage): VisualFrame {
  const rotation = normalizeRotation(page.getRotation().angle);
  const { width, height } = page.getCropBox();
  return rotation % 180 === 0
    ? { rotation, width, height }
    : { rotation, width: height, height: width };
}

/**
 * Maps a point in visual space (origin bottom-left, y up, in points) to page coordinates.
 * Content drawn at the returned point with `rotate: degrees(rotation)` appears upright.
 */
export function visualToPage(page: PDFPage, vx: number, vy: number): { x: number; y: number } {
  const { x: ox, y: oy, width: w, height: h } = page.getCropBox();
  const { rotation } = visualFrame(page);
  switch (rotation) {
    case 0:
      return { x: ox + vx, y: oy + vy };
    case 90:
      return { x: ox + w - vy, y: oy + vx };
    case 180:
      return { x: ox + w - vx, y: oy + h - vy };
    case 270:
      return { x: ox + vy, y: oy + h - vx };
  }
}
