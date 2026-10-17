import { diffWords, type DiffPart } from "@everything-pdf/engine/pure";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Dropzone } from "../components/Dropzone";
import { BusyOverlay, NoticeToast, PasswordDialog } from "../components/Overlays";
import { Button, Segmented } from "../components/ui";
import { loadFiles, runTask } from "../lib/actions";
import { pluralize } from "../lib/files";
import { canvasToBlob, closeUnusedPdfs, openPdf, renderPage } from "../lib/pdfjs";
import { useWorkspace, type SourceFile } from "../store/workspace";

type View = "side" | "overlay";

async function pageTexts(file: SourceFile): Promise<string[]> {
  const doc = await openPdf(file.id, file.bytes);
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return texts;
}

async function renderAt(
  file: SourceFile,
  index: number,
  width: number,
): Promise<HTMLCanvasElement | null> {
  const doc = await openPdf(file.id, file.bytes);
  if (index >= doc.numPages) return null;
  return renderPage(doc, index, { width });
}

/** Red where the pages differ, over a faded copy of the second page. */
function diffImage(
  a: HTMLCanvasElement | null,
  b: HTMLCanvasElement | null,
): { canvas: HTMLCanvasElement; changed: number } | null {
  if (!a || !b) return null;
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const da = a.getContext("2d")!.getImageData(0, 0, width, height).data;
  const db = b.getContext("2d")!.getImageData(0, 0, width, height).data;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  let changed = 0;
  for (let i = 0; i < da.length; i += 4) {
    // Transparent (blank) areas count as white.
    const pa = da[i + 3]! ? [da[i]!, da[i + 1]!, da[i + 2]!] : [255, 255, 255];
    const pb = db[i + 3]! ? [db[i]!, db[i + 1]!, db[i + 2]!] : [255, 255, 255];
    const delta = Math.abs(pa[0]! - pb[0]!) + Math.abs(pa[1]! - pb[1]!) + Math.abs(pa[2]! - pb[2]!);
    if (delta > 60) {
      changed++;
      image.data.set([230, 30, 30, 255], i);
    } else {
      const gray = 255 - (255 - (pb[0]! * 0.3 + pb[1]! * 0.59 + pb[2]! * 0.11)) * 0.35;
      image.data.set([gray, gray, gray, 255], i);
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas: out, changed: changed / (width * height) };
}

const toUrl = async (canvas: HTMLCanvasElement | null) =>
  canvas ? URL.createObjectURL(await canvasToBlob(canvas, "image/png")) : null;

export function Compare() {
  const [a, setA] = useState<SourceFile | null>(null);
  const [b, setB] = useState<SourceFile | null>(null);
  const [texts, setTexts] = useState<{ a: string[]; b: string[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>("side");
  const [images, setImages] = useState<{
    key: string;
    a: string | null;
    b: string | null;
    diff: string | null;
    changed: number;
  } | null>(null);

  useEffect(() => {
    document.title = "Compare PDFs · everything-pdf";
  }, []);

  // Close the documents opened here when leaving; the workspace keeps its own.
  useEffect(
    () => () => closeUnusedPdfs(new Set(useWorkspace.getState().pages.map((p) => p.fileId))),
    [],
  );

  const pick = async (files: File[], set: (f: SourceFile) => void) => {
    const [file] = await loadFiles(files.slice(0, 1));
    if (file) set(file);
  };

  // Read all the text once both are in.
  useEffect(() => {
    if (!a || !b) return;
    let cancelled = false;
    void runTask("Reading text…", async () => {
      const result = { a: await pageTexts(a), b: await pageTexts(b) };
      if (!cancelled) setTexts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [a, b]);

  const key = `${a?.id}:${b?.id}:${index}`;
  useEffect(() => {
    if (!a || !b) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const width = Math.min(
        1200,
        Math.round(window.innerWidth * 0.45 * (window.devicePixelRatio || 1)),
      );
      const [ca, cb] = [await renderAt(a, index, width), await renderAt(b, index, width)];
      const diff = diffImage(ca, cb);
      const [ua, ub, ud] = [await toUrl(ca), await toUrl(cb), await toUrl(diff?.canvas ?? null)];
      urls.push(...[ua, ub, ud].filter((u): u is string => !!u));
      if (!cancelled) setImages({ key, a: ua, b: ub, diff: ud, changed: diff?.changed ?? 1 });
    })().catch((err: unknown) => console.error(err));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [a, b, index, key]);

  const pageCount = Math.max(texts?.a.length ?? 0, texts?.b.length ?? 0);
  const changedPages = texts
    ? Array.from({ length: pageCount }, (_, i) => i).filter(
        (i) =>
          (texts.a[i] ?? "").replace(/\s+/g, " ").trim() !==
          (texts.b[i] ?? "").replace(/\s+/g, " ").trim(),
      )
    : [];
  const parts: DiffPart[] = texts ? diffWords(texts.a[index] ?? "", texts.b[index] ?? "") : [];
  const shown = images?.key === key ? images : null;

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
        <h1 className="text-lg">compare pdfs</h1>
        {a && b && (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              setA(null);
              setB(null);
              setTexts(null);
              setIndex(0);
            }}
          >
            Start over
          </Button>
        )}
      </header>

      {!a || !b ? (
        <main className="grid flex-1 gap-4 p-4 sm:grid-cols-2 sm:p-8">
          {a ? (
            <Picked label="Original" file={a} />
          ) : (
            <Dropzone
              onFiles={(f) => void pick(f, setA)}
              accept="application/pdf,.pdf"
              title="original PDF"
            />
          )}
          {b ? (
            <Picked label="Changed" file={b} />
          ) : (
            <Dropzone
              onFiles={(f) => void pick(f, setB)}
              accept="application/pdf,.pdf"
              title="changed PDF"
            />
          )}
        </main>
      ) : (
        <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center">
              <Button
                variant="ghost"
                className="px-1.5"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-20 text-center text-sm">
                page {index + 1} / {pageCount || "…"}
              </span>
              <Button
                variant="ghost"
                className="px-1.5"
                disabled={index >= pageCount - 1}
                onClick={() => setIndex(index + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="w-56">
              <Segmented
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: "side", label: "Side by side" },
                  { value: "overlay", label: "Differences" },
                ]}
              />
            </div>
            {texts && (
              <p className="text-sm text-ink-2">
                {texts.a.length !== texts.b.length &&
                  `Page counts differ (${texts.a.length} vs ${texts.b.length}). `}
                {changedPages.length
                  ? `Text changed on ${pluralize(changedPages.length, "page")}: `
                  : "No text changes. "}
                {changedPages.slice(0, 20).map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`mr-1 border-2 px-1.5 text-xs ${i === index ? "border-ink bg-accent" : "border-ink"}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </p>
            )}
          </div>

          {!shown ? (
            <LoaderCircle className="mx-auto mt-16 size-8 animate-spin" aria-label="Rendering" />
          ) : view === "side" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <PageImage label={`Original: ${a.name}`} url={shown.a} />
              <PageImage label={`Changed: ${b.name}`} url={shown.b} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-2xl">
              <PageImage
                label={
                  shown.changed === 0
                    ? "These pages look identical."
                    : `Red marks where the pages look different (${(shown.changed * 100).toFixed(1)}% of the page).`
                }
                url={shown.diff}
              />
            </div>
          )}

          {texts && (
            <section aria-label="Text differences" className="border-2 border-ink p-3">
              <p className="mb-2 text-sm text-ink-2">
                Text on this page: <span className="bg-[#ffd6d6] line-through">removed</span>{" "}
                <span className="bg-[#cdf5d0]">added</span>
              </p>
              <p className="font-mono text-sm leading-relaxed break-words">
                {parts.length === 0 && <span className="text-ink-3">No text on this page.</span>}
                {parts.map((p, i) =>
                  p.type === "same" ? (
                    <span key={i}>{p.text} </span>
                  ) : p.type === "removed" ? (
                    <del key={i} className="bg-[#ffd6d6]">
                      {p.text}{" "}
                    </del>
                  ) : (
                    <ins key={i} className="bg-[#cdf5d0] no-underline">
                      {p.text}{" "}
                    </ins>
                  ),
                )}
              </p>
            </section>
          )}
        </main>
      )}
      <BusyOverlay />
      <PasswordDialog />
      <NoticeToast />
    </div>
  );
}

function Picked({ label, file }: { label: string; file: SourceFile }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border-2 border-ink p-8 text-center">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="text-lg break-all">{file.name}</p>
      <p className="text-sm text-ink-2">{pluralize(file.pageCount, "page")}</p>
    </div>
  );
}

function PageImage({ label, url }: { label: string; url: string | null }) {
  return (
    <figure className="space-y-1">
      <figcaption className="truncate text-sm text-ink-2">{label}</figcaption>
      {url ? (
        <img src={url} alt={label} className="w-full border-2 border-ink" />
      ) : (
        <div className="flex aspect-[3/4] items-center justify-center border-2 border-dashed border-ink-3 text-sm text-ink-3">
          No such page
        </div>
      )}
    </figure>
  );
}
