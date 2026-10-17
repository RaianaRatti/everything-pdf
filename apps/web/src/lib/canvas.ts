import { readBytes } from "./files";
import { canvasToBlob } from "./pdfjs";

/** Crops a canvas to its non-transparent content, plus padding. Returns null if it's empty. */
export function trimCanvas(source: HTMLCanvasElement, padding = 8): HTMLCanvasElement | null {
  const ctx = source.getContext("2d")!;
  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height,
    left = width,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;

  const out = document.createElement("canvas");
  out.width = right - left + 1 + padding * 2;
  out.height = bottom - top + 1 + padding * 2;
  out.getContext("2d")!.drawImage(source, -left + padding, -top + padding);
  return out;
}

/** Makes near-white pixels transparent — for photos or scans of a signature on paper. */
export function removeWhiteBackground(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const lightness = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    // Fully transparent above 225, fading in below so edges stay smooth.
    const alpha = lightness >= 225 ? 0 : lightness <= 160 ? 255 : ((225 - lightness) / 65) * 255;
    d[i + 3] = Math.min(d[i + 3]!, alpha);
  }
  ctx.putImageData(image, 0, 0);
}

export interface PngImage {
  bytes: Uint8Array;
  url: string;
  width: number;
  height: number;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<PngImage> {
  const blob = await canvasToBlob(canvas, "image/png");
  return {
    bytes: await readBytes(blob),
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}
