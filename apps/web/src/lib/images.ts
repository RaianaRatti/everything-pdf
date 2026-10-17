import { jpegOrientation, sniffImageType, type ImageType } from "@everything-pdf/engine/pure";
import { canvasToBlob } from "./pdfjs";
import { readBytes } from "./files";

export interface PreparedImage {
  bytes: Uint8Array;
  type: ImageType;
  width: number;
  height: number;
}

/**
 * Turns any browser-decodable image into PNG or JPEG bytes that pdf-lib can embed. JPEG/PNG
 * pass through untouched unless a photo's EXIF orientation needs to be baked in.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bytes = await readBytes(file);
  const type = sniffImageType(bytes);

  let bitmap: ImageBitmap;
  try {
    // createImageBitmap applies EXIF orientation, so its dimensions are the upright ones.
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image format isn't supported by your browser.");
  }
  const { width, height } = bitmap;

  if (type === "png" || (type === "jpg" && jpegOrientation(bytes) === 1)) {
    bitmap.close();
    return { bytes, type, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const outType = type === "jpg" ? "jpg" : "png";
  const blob = await canvasToBlob(canvas, outType === "jpg" ? "image/jpeg" : "image/png", 0.92);
  return { bytes: await readBytes(blob), type: outType, width, height };
}
