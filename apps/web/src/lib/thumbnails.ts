import { canvasToBlob, openPdf, renderPage } from "./pdfjs";

const THUMB_WIDTH = 220;
const MAX_ENTRIES = 400;

/** LRU cache of thumbnail object URLs, keyed by file, page and rotation. */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function getThumbnail(
  fileId: string,
  bytes: Uint8Array,
  pageIndex: number,
  rotation: number,
): Promise<string> {
  const key = `${fileId}:${pageIndex}:${rotation}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit);
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const doc = await openPdf(fileId, bytes);
    const canvas = await renderPage(doc, pageIndex, {
      rotation,
      width: THUMB_WIDTH * Math.min(window.devicePixelRatio || 1, 2),
    });
    const url = URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.8));
    cache.set(key, url);
    while (cache.size > MAX_ENTRIES) {
      const [oldest, oldUrl] = cache.entries().next().value!;
      cache.delete(oldest);
      URL.revokeObjectURL(oldUrl);
    }
    return url;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
