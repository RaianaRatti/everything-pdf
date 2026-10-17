import {
  detectDocument,
  enhanceScan,
  flattenedSize,
  toGray,
  warpPerspective,
  type Quad,
  type ScanFilter,
} from "@everything-pdf/engine/pure";
import { readBytes } from "./files";
import { canvasToBlob } from "./pdfjs";

/** Photos are kept at most this big (longer side), plenty for a page at 300 DPI. */
const MAX_SOURCE = 3200;
/** Size used to find the page: small is fast, and edges don't need detail. */
const DETECT_SIZE = 360;

export interface Shot {
  id: string;
  /** The photo, upright and capped in size. */
  source: HTMLCanvasElement;
  /** Page corners in source pixels: top-left, top-right, bottom-right, bottom-left. */
  quad: Quad;
  filter: ScanFilter;
  /** Extra clockwise rotation after flattening (0/90/180/270). */
  rotation: number;
}

export async function photoToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  // createImageBitmap applies EXIF orientation, so phone photos come out upright.
  const bitmap = await createImageBitmap(file);
  return bitmapToCanvas(bitmap);
}

export function bitmapToCanvas(
  source: CanvasImageSource & { width: number; height: number },
): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SOURCE / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source && typeof source.close === "function") source.close();
  return canvas;
}

/** Finds the page in a photo; falls back to the whole photo with a small inset. */
export function findPage(source: HTMLCanvasElement): Quad {
  const scale = DETECT_SIZE / Math.max(source.width, source.height);
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d")!;
  ctx.drawImage(source, 0, 0, w, h);
  const found = detectDocument(toGray(ctx.getImageData(0, 0, w, h).data), w, h);
  if (found) return found.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
  const inset = 0.04;
  const [W, H] = [source.width, source.height];
  return [
    { x: W * inset, y: H * inset },
    { x: W * (1 - inset), y: H * inset },
    { x: W * (1 - inset), y: H * (1 - inset) },
    { x: W * inset, y: H * (1 - inset) },
  ];
}

/** Flattens, cleans up and rotates a shot. `maxSide` limits the output for previews. */
export function processShot(shot: Shot, maxSide = 2480): HTMLCanvasElement {
  const { source, quad } = shot;
  const { width, height } = flattenedSize(quad, maxSide);
  const src = source.getContext("2d")!.getImageData(0, 0, source.width, source.height).data;
  const pixels = warpPerspective(src, source.width, source.height, quad, width, height);
  enhanceScan(pixels, shot.filter);
  const flat = document.createElement("canvas");
  flat.width = width;
  flat.height = height;
  flat.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
  if (!shot.rotation) return flat;
  const turned = document.createElement("canvas");
  const sideways = shot.rotation % 180 !== 0;
  turned.width = sideways ? height : width;
  turned.height = sideways ? width : height;
  const ctx = turned.getContext("2d")!;
  ctx.translate(turned.width / 2, turned.height / 2);
  ctx.rotate((shot.rotation * Math.PI) / 180);
  ctx.drawImage(flat, -width / 2, -height / 2);
  return turned;
}

/** The finished page image: PNG for black and white (small and crisp), JPEG otherwise. */
export async function shotToImage(shot: Shot): Promise<{ bytes: Uint8Array; type: "png" | "jpg" }> {
  const canvas = processShot(shot);
  const type = shot.filter === "bw" ? "png" : "jpg";
  const bytes = await readBytes(
    await canvasToBlob(canvas, type === "png" ? "image/png" : "image/jpeg", 0.85),
  );
  canvas.width = canvas.height = 0;
  return { bytes, type };
}
