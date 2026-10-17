import type { Point, Quad, ScanFilter } from "@everything-pdf/engine/pure";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  ImagePlus,
  LayoutGrid,
  RotateCw,
  ScanLine,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FilePickerButton } from "../components/Dropzone";
import { BusyOverlay, NoticeToast } from "../components/Overlays";
import { Button, Field, Hint, PanelSection, Segmented } from "../components/ui";
import { errorMessage, runTask } from "../lib/actions";
import { downloadBytes } from "../lib/download";
import { engine } from "../lib/engine";
import { pluralize, uid } from "../lib/files";
import { canvasToBlob } from "../lib/pdfjs";
import {
  bitmapToCanvas,
  findPage,
  photoToCanvas,
  processShot,
  shotToImage,
  type Shot,
} from "../lib/scanImage";
import { useWorkspace } from "../store/workspace";

type PageSize = "a4" | "letter" | "fit";

export function Scan() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const navigate = useNavigate();
  const selected = shots.find((s) => s.id === selectedId) ?? shots[0];

  useEffect(() => {
    document.title = "Scan with camera · everything-pdf";
  }, []);

  const addCanvases = (canvases: HTMLCanvasElement[]) => {
    const added = canvases.map((source) => ({
      id: uid(),
      source,
      quad: findPage(source),
      filter: "color" as ScanFilter,
      rotation: 0,
    }));
    setShots((list) => [...list, ...added]);
    if (added[0]) setSelectedId(added.at(-1)!.id);
  };

  const addPhotos = (files: File[]) =>
    void runTask("Finding pages…", async () => {
      const canvases = [];
      for (const file of files.filter(
        (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name),
      )) {
        try {
          canvases.push(await photoToCanvas(file));
        } catch (err) {
          useWorkspace
            .getState()
            .setNotice({ kind: "error", message: `${file.name}: ${errorMessage(err)}` });
        }
      }
      addCanvases(canvases);
    });

  const update = (id: string, patch: Partial<Shot>) =>
    setShots((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (index: number, delta: number) =>
    setShots((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  /** Builds the PDF from all shots. */
  const build = async () => {
    const { setBusy } = useWorkspace.getState();
    const images = [];
    for (const [i, shot] of shots.entries()) {
      setBusy(`Straightening page ${i + 1} of ${shots.length}…`);
      // Let the overlay paint before the heavy work.
      await new Promise((r) => setTimeout(r, 0));
      images.push(await shotToImage(shot));
    }
    setBusy("Building PDF…");
    return engine.imagesToPdf(images, { pageSize, margin: 0 });
  };

  const download = () =>
    void runTask("Preparing…", async () => downloadBytes(await build(), "scan.pdf"));

  const openInEditor = () =>
    void runTask("Preparing…", async () => {
      const bytes = await build();
      const ws = useWorkspace.getState();
      ws.reset();
      ws.addFiles([{ id: uid(), name: "scan.pdf", bytes, pageCount: shots.length }]);
      void navigate("/organize");
    });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-ink bg-card p-2 pr-14">
        <Link
          to="/"
          aria-label="All tools"
          className="rounded-md border-2 border-transparent px-3 py-1.5 hover:bg-accent"
        >
          ←
        </Link>
        <h1 className="text-lg">scan to pdf</h1>
      </header>

      {shots.length === 0 ? (
        <main className="flex flex-1 items-start justify-center p-4 sm:p-8">
          <div className="flex w-full max-w-2xl flex-col items-center gap-4 border-2 border-dashed border-ink px-6 py-16 text-center sm:mt-8">
            <ScanLine className="size-10" aria-hidden />
            <p className="text-xl">photograph your pages</p>
            <p className="max-w-md text-sm text-ink-2">
              Put each page on a darker surface. The edges are found and straightened, and the page
              is cleaned up to look scanned. Photos stay on your device.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {"mediaDevices" in navigator && (
                <Button variant="primary" onClick={() => setCamera(true)}>
                  <Camera className="size-4" /> Use camera
                </Button>
              )}
              <PhotoButton onFiles={addPhotos} />
            </div>
          </div>
        </main>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row">
          <aside
            aria-label="Pages"
            className="order-2 shrink-0 border-t border-ink p-3 lg:order-1 lg:w-44 lg:border-t-0 lg:border-r"
          >
            <ol className="flex gap-2 overflow-x-auto lg:flex-col">
              {shots.map((shot, i) => (
                <li key={shot.id} className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={`Page ${i + 1}`}
                    aria-pressed={shot.id === selected?.id}
                    onClick={() => setSelectedId(shot.id)}
                    className={`block w-24 border-2 p-1 lg:w-full ${shot.id === selected?.id ? "border-ink" : "border-transparent"}`}
                  >
                    <Thumb shot={shot} />
                    <span className="text-xs">{i + 1}</span>
                  </button>
                  <div className="absolute top-1 right-1 flex flex-col">
                    <button
                      type="button"
                      aria-label="Remove page"
                      onClick={() => setShots((l) => l.filter((s) => s.id !== shot.id))}
                      className="bg-ink/80 p-0.5 text-paper"
                    >
                      <X className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="bg-ink/80 p-0.5 text-paper disabled:opacity-30"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === shots.length - 1}
                      onClick={() => move(i, 1)}
                      className="bg-ink/80 p-0.5 text-paper disabled:opacity-30"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex gap-2 lg:flex-col">
              {"mediaDevices" in navigator && (
                <Button onClick={() => setCamera(true)}>
                  <Camera className="size-4" /> Camera
                </Button>
              )}
              <PhotoButton onFiles={addPhotos} compact />
            </div>
          </aside>

          <main className="order-1 flex flex-1 flex-col items-center gap-3 p-4 lg:order-2">
            {selected && (
              <CornerEditor
                key={selected.id}
                shot={selected}
                onChange={(quad) => update(selected.id, { quad })}
              />
            )}
          </main>

          <aside className="order-3 shrink-0 border-t border-ink bg-card lg:w-80 lg:border-t-0 lg:border-l">
            {selected && (
              <PanelSection title={`Page ${shots.indexOf(selected) + 1}`}>
                <Field label="Look">
                  <Segmented
                    label="Look"
                    value={selected.filter}
                    onChange={(filter) => update(selected.id, { filter })}
                    options={[
                      { value: "color", label: "Color" },
                      { value: "gray", label: "Gray" },
                      { value: "bw", label: "B&W" },
                    ]}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() =>
                      update(selected.id, { rotation: (selected.rotation + 90) % 360 })
                    }
                  >
                    <RotateCw className="size-4" /> Rotate
                  </Button>
                  <Button onClick={() => update(selected.id, { quad: findPage(selected.source) })}>
                    <ScanLine className="size-4" /> Re-detect
                  </Button>
                </div>
                <Preview shot={selected} />
                <Hint>
                  Drag the corners onto the page's corners if the edges weren't found exactly.
                </Hint>
              </PanelSection>
            )}
            <PanelSection title={pluralize(shots.length, "page")}>
              <Field label="Page size">
                <Segmented
                  label="Page size"
                  value={pageSize}
                  onChange={setPageSize}
                  options={[
                    { value: "a4", label: "A4" },
                    { value: "letter", label: "Letter" },
                    { value: "fit", label: "Photo size" },
                  ]}
                />
              </Field>
              <Button variant="primary" className="w-full" onClick={download}>
                <Download className="size-4" /> Download PDF
              </Button>
              <Button className="w-full" onClick={openInEditor}>
                <LayoutGrid className="size-4" /> Open in editor
              </Button>
            </PanelSection>
          </aside>
        </div>
      )}

      {camera && (
        <CameraDialog
          onCapture={(canvas) => addCanvases([canvas])}
          onClose={() => setCamera(false)}
        />
      )}
      <BusyOverlay />
      <NoticeToast />
    </div>
  );
}

function PhotoButton({
  onFiles,
  compact,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}) {
  return (
    <FilePickerButton
      onFiles={onFiles}
      accept="image/*"
      className="inline-flex items-center justify-center gap-2 border-2 border-ink px-3 py-2 text-sm hover:bg-accent"
    >
      <ImagePlus className="size-4" /> {compact ? "Photos" : "Choose photos"}
    </FilePickerButton>
  );
}

/** An object URL for a canvas, revoked when it changes or unmounts. */
function useCanvasUrl(make: () => HTMLCanvasElement | null, deps: unknown[]): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    // A short delay so dragging a corner doesn't recompute on every pixel.
    const timer = setTimeout(async () => {
      const canvas = make();
      if (!canvas || cancelled) return;
      made = URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.85));
      if (cancelled) URL.revokeObjectURL(made);
      else setUrl(made);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the real dependencies
  }, deps);
  return url;
}

function Thumb({ shot }: { shot: Shot }) {
  const url = useCanvasUrl(() => processShot(shot, 240), [shot]);
  return url ? (
    <img src={url} alt="" className="w-full border border-ink" />
  ) : (
    <div className="aspect-[3/4] w-full animate-pulse bg-paper-3" />
  );
}

function Preview({ shot }: { shot: Shot }) {
  const url = useCanvasUrl(() => processShot(shot, 900), [shot]);
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm text-ink-2">Result</figcaption>
      {url ? (
        <img src={url} alt="Straightened page" className="w-full border-2 border-ink" />
      ) : (
        <div className="aspect-[3/4] w-full animate-pulse bg-paper-3" />
      )}
    </figure>
  );
}

const CORNER_NAMES = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** The photo with the page outline; drag a corner (or focus it and use arrow keys) to adjust. */
function CornerEditor({ shot, onChange }: { shot: Shot; onChange: (quad: Quad) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const url = useCanvasUrl(() => shot.source, [shot.source]);
  const { width, height } = shot.source;
  const handle = Math.max(width, height) * 0.018;

  const toSource = (e: React.PointerEvent): Point => {
    const box = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, ((e.clientX - box.left) / box.width) * width)),
      y: Math.max(0, Math.min(height, ((e.clientY - box.top) / box.height) * height)),
    };
  };
  const setCorner = (i: number, p: Point) =>
    onChange(shot.quad.map((q, k) => (k === i ? p : q)) as Quad);

  return (
    <div
      className="relative w-full max-w-3xl"
      style={{ aspectRatio: `${width} / ${height}`, maxHeight: "calc(100dvh - 8rem)" }}
    >
      {url && (
        <img src={url} alt="Photo" className="absolute inset-0 size-full" draggable={false} />
      )}
      <svg
        ref={svg}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 size-full touch-none"
        onPointerMove={(e) => dragging.current !== null && setCorner(dragging.current, toSource(e))}
        onPointerUp={() => (dragging.current = null)}
      >
        <polygon
          points={shot.quad.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgb(255 255 255 / 0.12)"
          stroke="#1a4fd0"
          strokeWidth={handle / 3}
        />
        {shot.quad.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={handle}
            role="slider"
            tabIndex={0}
            aria-label={`${CORNER_NAMES[i]} corner`}
            aria-valuetext={`${Math.round(p.x)}, ${Math.round(p.y)}`}
            fill="#1a4fd0"
            stroke="white"
            strokeWidth={handle / 4}
            className="cursor-grab"
            onPointerDown={(e) => {
              e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);
              dragging.current = i;
            }}
            onKeyDown={(e) => {
              const step = Math.max(width, height) * (e.shiftKey ? 0.02 : 0.004);
              const d: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const m = d[e.key];
              if (!m) return;
              e.preventDefault();
              setCorner(i, {
                x: Math.max(0, Math.min(width, p.x + m[0])),
                y: Math.max(0, Math.min(height, p.y + m[1])),
              });
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function CameraDialog({
  onCapture,
  onClose,
}: {
  onCapture: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch(() =>
        setError("The camera isn't available. Allow camera access, or choose photos instead."),
      );
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const frame = document.createElement("canvas");
    frame.width = v.videoWidth;
    frame.height = v.videoHeight;
    frame.getContext("2d")!.drawImage(v, 0, 0);
    onCapture(bitmapToCanvas(frame));
    setCount((n) => n + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ink/90 p-4"
    >
      {error ? (
        <p className="max-w-sm bg-card p-4 text-sm">{error}</p>
      ) : (
        <video
          ref={video}
          playsInline
          muted
          className="max-h-[75dvh] max-w-full border-2 border-paper"
        />
      )}
      <div className="flex items-center gap-3">
        {!error && (
          <Button variant="primary" className="border-paper" onClick={capture}>
            <Camera className="size-4" /> Take photo
          </Button>
        )}
        <Button onClick={onClose}>Done{count ? ` (${pluralize(count, "page")})` : ""}</Button>
      </div>
    </div>
  );
}
