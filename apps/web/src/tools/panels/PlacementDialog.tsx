import type { RelativeRect } from "@everything-pdf/engine";

/** The box being dragged always has an explicit height. */
type Box = Required<RelativeRect>;
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PngImage } from "../../lib/canvas";
import { canvasToBlob, openPdf, renderPage } from "../../lib/pdfjs";
import { useWorkspace, type PageItem } from "../../store/workspace";
import { Button, Checkbox } from "../../components/ui";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Shows a page with the signature on top; the user drags it into place and resizes it from the
 * corner. Position is reported as fractions of the displayed page.
 */
export function PlacementDialog({
  page,
  pageNumber,
  signature,
  onCancel,
  onApply,
}: {
  page: PageItem;
  pageNumber: number;
  signature: PngImage;
  onCancel: () => void;
  onApply: (rect: Box, allPages: boolean) => void;
}) {
  const file = useWorkspace((s) => s.files[page.fileId]!);
  const [preview, setPreview] = useState<{ url: string; aspect: number } | null>(null);
  const [rect, setRect] = useState<Box | null>(null);
  const [allPages, setAllPages] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: "move" | "resize";
    x: number;
    y: number;
    start: Box;
  } | null>(null);

  const sigAspect = signature.width / signature.height;

  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    (async () => {
      const doc = await openPdf(file.id, file.bytes);
      const canvas = await renderPage(doc, page.pageIndex, {
        rotation: page.rotation,
        width: Math.min(900, window.innerWidth * 0.9) * Math.min(window.devicePixelRatio || 1, 2),
      });
      url = URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.9));
      if (cancelled) return URL.revokeObjectURL(url);
      const aspect = canvas.width / canvas.height;
      setPreview({ url, aspect });

      // Start at a sensible size near the bottom right, where signatures usually go.
      let width = 0.3;
      let height = (width * aspect) / sigAspect;
      if (height > 0.15) {
        width *= 0.15 / height;
        height = 0.15;
      }
      setRect({ x: 0.92 - width, y: 0.88 - height, width, height });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, page.pageIndex, page.rotation, sigAspect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const startDrag = (e: React.PointerEvent, kind: "move" | "resize") => {
    if (!rect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, start: rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = area.current?.getBoundingClientRect();
    if (!d || !box || !preview) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    const s = d.start;
    if (d.kind === "move") {
      setRect({ ...s, x: clamp(s.x + dx, 0, 1 - s.width), y: clamp(s.y + dy, 0, 1 - s.height) });
    } else {
      // Keep the signature's proportions; stop at the page edges.
      const ratio = preview.aspect / sigAspect; // height fraction per width fraction
      const maxWidth = Math.min(1 - s.x, (1 - s.y) / ratio);
      const width = clamp(s.width + dx, 0.04, maxWidth);
      setRect({ ...s, width, height: width * ratio });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Place signature on page ${pageNumber}`}
      className="fixed inset-0 z-40 flex flex-col items-center gap-4 overflow-auto bg-ink/60 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-[900px] flex-wrap items-center justify-between gap-3 bg-card p-3">
        <p className="text-sm">
          Drag the signature into place on page {pageNumber}; drag the corner to resize.
        </p>
        <div className="flex items-center gap-3">
          <Checkbox checked={allPages} onChange={setAllPages} label="All pages" />
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!rect}
            onClick={() => rect && onApply(rect, allPages)}
          >
            Apply
          </Button>
        </div>
      </div>

      {!preview || !rect ? (
        <LoaderCircle className="mt-24 size-8 animate-spin text-paper" aria-label="Loading page" />
      ) : (
        <div
          ref={area}
          className="relative shrink-0 touch-none bg-card select-none"
          // Fit the whole page on screen so the signature is never below the fold.
          style={{
            aspectRatio: preview.aspect,
            width: `min(900px, 100%, calc((100dvh - 7rem) * ${preview.aspect}))`,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
        >
          <img
            src={preview.url}
            alt={`Page ${pageNumber}`}
            className="absolute inset-0 size-full"
            draggable={false}
          />
          <div
            onPointerDown={(e) => startDrag(e, "move")}
            className="absolute cursor-move outline-2 outline-ink outline-dashed"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
          >
            <img src={signature.url} alt="Your signature" className="size-full" draggable={false} />
            <div
              onPointerDown={(e) => startDrag(e, "resize")}
              aria-label="Resize signature"
              className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full border-2 border-card bg-ink"
            />
          </div>
        </div>
      )}
    </div>
  );
}
