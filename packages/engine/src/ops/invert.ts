/**
 * Inverts RGBA pixel data in place (alpha untouched). Used for raster "invert colors":
 * the app renders each page, inverts it, and rebuilds the page with replacePagesWithImages.
 */
export function invertPixels(data: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]!;
    data[i + 1] = 255 - data[i + 1]!;
    data[i + 2] = 255 - data[i + 2]!;
  }
}

/** Converts RGBA pixel data to grayscale in place using Rec. 601 luma (alpha untouched). */
export function grayscalePixels(data: Uint8ClampedArray | Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    data[i] = data[i + 1] = data[i + 2] = y;
  }
}
