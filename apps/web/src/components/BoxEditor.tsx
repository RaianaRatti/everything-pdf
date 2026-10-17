import type { Box } from "@everything-pdf/engine";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

export type { Box };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

/**
 * A box positioned in fractions (0–1) of `area`, that can be dragged and resized from its
 * corners. With `ratio` (height fraction per width fraction) resizing keeps proportions.
 */
export function DraggableBox({
  box,
  onChange,
  area,
  ratio,
  minSize = 0.02,
  resizable = true,
  selected = true,
  onSelect,
  label,
  className = "",
  children,
}: {
  box: Box;
  onChange: (box: Box) => void;
  area: RefObject<HTMLElement | null>;
  ratio?: number;
  minSize?: number;
  resizable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const drag = useRef<{ kind: "move" | Corner; x: number; y: number; start: Box } | null>(null);
  // Always read the latest callback from pointer handlers.
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  });

  const start = (e: React.PointerEvent, kind: "move" | Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect?.();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, start: box };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = area.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = (e.clientX - d.x) / rect.width;
    const dy = (e.clientY - d.y) / rect.height;
    const s = d.start;
    if (d.kind === "move") {
      change.current({
        ...s,
        x: clamp(s.x + dx, 0, 1 - s.width),
        y: clamp(s.y + dy, 0, 1 - s.height),
      });
      return;
    }
    // Resize, keeping the opposite corner fixed.
    const west = d.kind.includes("w");
    const north = d.kind.includes("n");
    const right = s.x + s.width;
    const bottom = s.y + s.height;
    let width = clamp(west ? s.width - dx : s.width + dx, minSize, west ? right : 1 - s.x);
    let height = clamp(north ? s.height - dy : s.height + dy, minSize, north ? bottom : 1 - s.y);
    if (ratio) {
      // Follow the width, then shrink both if the height would leave the page.
      height = width * ratio;
      const maxHeight = north ? bottom : 1 - s.y;
      if (height > maxHeight) {
        height = maxHeight;
        width = height / ratio;
      }
    }
    change.current({
      x: west ? right - width : s.x,
      y: north ? bottom - height : s.y,
      width,
      height,
    });
  };

  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onChange({
      ...box,
      x: clamp(box.x + d[0], 0, 1 - box.width),
      y: clamp(box.y + d[1], 0, 1 - box.height),
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onPointerDown={(e) => start(e, "move")}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onKeyDown={nudge}
      onFocus={onSelect}
      className={`absolute cursor-move touch-none ${
        selected ? "outline-2 outline-offset-1 outline-ink outline-dashed" : ""
      } ${className}`}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
    >
      {children}
      {selected &&
        resizable &&
        CORNERS.map((corner) => (
          <div
            key={corner}
            aria-hidden
            onPointerDown={(e) => start(e, corner)}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            className={`absolute size-3.5 border-2 border-paper bg-ink ${
              corner === "nw"
                ? "-top-2 -left-2 cursor-nwse-resize"
                : corner === "ne"
                  ? "-top-2 -right-2 cursor-nesw-resize"
                  : corner === "sw"
                    ? "-bottom-2 -left-2 cursor-nesw-resize"
                    : "-right-2 -bottom-2 cursor-nwse-resize"
            }`}
          />
        ))}
    </div>
  );
}

/** Full-screen dialog chrome for editing on a large page preview. */
export function PageDialog({
  label,
  toolbar,
  onCancel,
  children,
}: {
  label: string;
  toolbar: ReactNode;
  onCancel: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (e.key === "Escape" && !typing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-40 flex flex-col items-center gap-3 overflow-auto bg-ink/60 p-3 backdrop-blur-sm sm:p-4"
    >
      <div className="flex w-full max-w-[1000px] flex-wrap items-center gap-2 border-2 border-ink bg-card p-2">
        {toolbar}
      </div>
      {children}
    </div>
  );
}

/**
 * The page image, sized to fit the screen, with an overlay for boxes. Clicking empty page area
 * calls `onBackgroundClick`.
 */
export function PageStage({
  url,
  aspect,
  area,
  alt,
  onBackgroundPointerDown,
  children,
}: {
  url: string;
  aspect: number;
  area: RefObject<HTMLDivElement | null>;
  alt: string;
  onBackgroundPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}) {
  return (
    <div
      ref={area}
      className="relative shrink-0 bg-card select-none"
      style={{
        aspectRatio: aspect,
        width: `min(1000px, 100%, calc((100dvh - 9rem) * ${aspect}))`,
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") {
          onBackgroundPointerDown?.(e);
        }
      }}
    >
      <img src={url} alt={alt} className="absolute inset-0 size-full" draggable={false} />
      {children}
    </div>
  );
}
