import { useEffect, useState } from "react";
import { useWorkspace, type PageItem } from "../store/workspace";
import { canvasToBlob, openPdf, pageSizeInPoints, renderPage } from "./pdfjs";

export interface PagePreview {
  url: string;
  /** width / height, as displayed. */
  aspect: number;
  /** Displayed size in points, to convert font sizes. */
  widthPt: number;
  heightPt: number;
}

/** Renders a large preview of a workspace page for editing dialogs. */
export function usePagePreview(page: PageItem | undefined): PagePreview | null {
  const file = useWorkspace((s) => (page ? s.files[page.fileId] : undefined));
  // Keyed by page, so a preview for a previous page is never shown for this one.
  const [state, setState] = useState<{ page: PageItem; preview: PagePreview } | null>(null);

  useEffect(() => {
    if (!page || !file) return;
    let url: string | undefined;
    let cancelled = false;
    (async () => {
      const doc = await openPdf(file.id, file.bytes);
      const size = await pageSizeInPoints(doc, page.pageIndex, page.rotation);
      const canvas = await renderPage(doc, page.pageIndex, {
        rotation: page.rotation,
        width: Math.min(1000, window.innerWidth * 0.9) * Math.min(window.devicePixelRatio || 1, 2),
      });
      url = URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.9));
      canvas.width = canvas.height = 0;
      if (cancelled) return URL.revokeObjectURL(url);
      setState({
        page,
        preview: {
          url,
          aspect: size.width / size.height,
          widthPt: size.width,
          heightPt: size.height,
        },
      });
    })().catch((err: unknown) => console.error("Preview failed", err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, page]);

  return state && state.page === page ? state.preview : null;
}
