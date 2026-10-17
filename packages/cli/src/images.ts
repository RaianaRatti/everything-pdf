import { jpegOrientation, sniffImageType, type ImageType } from "@everything-pdf/engine/pure";
import type { ImageCodec } from "@everything-pdf/engine";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";

export interface LoadedImage {
  bytes: Uint8Array;
  type: ImageType;
}

/**
 * Turns any image the native decoder understands (PNG, JPEG, WebP, GIF, AVIF, BMP…) into PNG
 * or JPEG bytes pdf-lib can embed. JPEG and PNG pass through untouched unless a photo's EXIF
 * orientation needs baking in, since pdf-lib ignores EXIF.
 */
export async function prepareImage(bytes: Uint8Array): Promise<LoadedImage> {
  const type = sniffImageType(bytes);
  const orientation = type === "jpg" ? jpegOrientation(bytes) : 1;
  if (type === "png" || (type === "jpg" && orientation === 1)) return { bytes, type };

  let image: Image;
  try {
    image = await loadImage(Buffer.from(bytes));
  } catch {
    throw new Error("unsupported or corrupted image");
  }
  const { width: w, height: h } = image;
  const swap = orientation >= 5;
  const canvas = createCanvas(swap ? h : w, swap ? w : h);
  const ctx = canvas.getContext("2d");
  // Standard EXIF orientation transforms (https://magnushoff.com/articles/jpeg-orientation/).
  const transforms: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  };
  const t = transforms[orientation];
  if (t) ctx.transform(...t);
  ctx.drawImage(image, 0, 0);

  return type === "jpg"
    ? { bytes: new Uint8Array(await canvas.encode("jpeg", 92)), type: "jpg" }
    : { bytes: new Uint8Array(await canvas.encode("png")), type: "png" };
}

/** Re-encodes JPEGs for compression using the native image library. */
export const nodeCodec: ImageCodec = {
  async reencodeJpeg(jpeg, { quality, maxDimension }) {
    const image = await loadImage(Buffer.from(jpeg));
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    const bytes = new Uint8Array(await canvas.encode("jpeg", Math.round(quality * 100)));
    return { bytes, width, height };
  },

  async encodeJpeg(pixels, { width, height, channels }, { quality, maxDimension }) {
    const source = createCanvas(width, height);
    const ctx = source.getContext("2d");
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const o = i * channels;
      image.data[i * 4] = pixels[o]!;
      image.data[i * 4 + 1] = pixels[channels === 3 ? o + 1 : o]!;
      image.data[i * 4 + 2] = pixels[channels === 3 ? o + 2 : o]!;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = createCanvas(w, h);
    canvas.getContext("2d").drawImage(source, 0, 0, w, h);
    const bytes = new Uint8Array(await canvas.encode("jpeg", Math.round(quality * 100)));
    return { bytes, width: w, height: h };
  },
};
