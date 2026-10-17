import {
  REDACTION_PATTERNS,
  findMatches,
  keepOutside,
  literalPattern,
  type RedactBox,
  type RedactionPattern,
} from "@everything-pdf/engine/pure";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  ShieldX,
  Square,
  Trash,
} from "lucide-react";
import { useRef, useState } from "react";
import { DraggableBox, PageDialog, PageStage } from "../../components/BoxEditor";
import { Button, Checkbox, Field, Hint, PanelSection, inputClass } from "../../components/ui";
import { applyToDocument, runTask } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { pluralize, uid } from "../../lib/files";
import { rasterizePages } from "../../lib/raster";
import { textRuns } from "../../lib/textRuns";
import { usePagePreview } from "../../lib/usePagePreview";
import { selectedPages, useWorkspace } from "../../store/workspace";

interface Mark extends RedactBox {
  id: string;
}

/** Marks per page id. */
type Marks = Record<string, Mark[]>;

const RENDER_DPI = 200;

export function RedactPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const [terms, setTerms] = useState("");
  const [patterns, setPatterns] = useState<RedactionPattern[]>([]);
  const [marks, setMarks] = useState<Marks>({});
  const [found, setFound] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [stripMetadata, setStripMetadata] = useState(true);

  // Marks on pages that no longer exist (deleted, or replaced by an edit) don't count.
  const alive = new Set(pages.map((p) => p.id));
  const live = Object.fromEntries(Object.entries(marks).filter(([id]) => alive.has(id)));
  const markCount = Object.values(live).reduce((n, list) => n + list.length, 0);
  const pageCount = Object.values(live).filter((list) => list.length).length;

  const search = () =>
    void runTask("Searching…", async () => {
      const { files, setBusy } = useWorkspace.getState();
      const regexes = [
        ...terms
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => literalPattern(t)),
        ...patterns.map((p) => REDACTION_PATTERNS[p].regex),
      ];
      const next: Marks = { ...live };
      let hits = 0;
      for (const [i, page] of pages.entries()) {
        setBusy(`Searching page ${i + 1} of ${pages.length}…`);
        const runs = await textRuns(page, files);
        const boxes = regexes.flatMap((r) => findMatches(runs, r));
        if (boxes.length) {
          next[page.id] = [...(next[page.id] ?? []), ...boxes.map((b) => ({ ...b, id: uid() }))];
          hits += boxes.length;
        }
      }
      setMarks(next);
      setFound(
        hits
          ? `Marked ${pluralize(hits, "match", "matches")}. Review them before applying.`
          : "Nothing found. Scanned pages have no text to search: run OCR first, or mark areas by hand.",
      );
    });

  const apply = () => {
    const { files, setBusy, setDocInfo } = useWorkspace.getState();
    const targets = pages.flatMap((page, pageIndex) =>
      live[page.id]?.length ? [{ page, pageIndex, boxes: live[page.id]! }] : [],
    );
    if (stripMetadata) setDocInfo(null);
    void applyToDocument(
      "Redacting…",
      async (bytes) => {
        const images = await rasterizePages(
          targets.map((t) => t.page),
          files,
          {
            dpi: RENDER_DPI,
            format: "jpg",
            quality: 0.9,
            paint: (ctx, width, height, i) => {
              ctx.fillStyle = "#000";
              for (const b of targets[i]!.boxes) {
                ctx.fillRect(b.x * width, b.y * height, b.width * width, b.height * height);
              }
            },
            onProgress: (n, total) =>
              setBusy(`Redacting page ${Math.min(n + 1, total)} of ${total}…`),
          },
        );
        setBusy("Rebuilding pages…");
        const redacted = [];
        for (const [i, t] of targets.entries()) {
          // What's left of the page's text stays searchable, minus anything under a box.
          const words = keepOutside(await textRuns(t.page, files), t.boxes).filter(
            (r) => !r.vertical,
          );
          redacted.push({ pageIndex: t.pageIndex, bytes: images[i]!, type: "jpg" as const, words });
        }
        return engine.redactPages(bytes, redacted);
      },
      `Redacted ${pluralize(markCount, "area")} on ${pluralize(targets.length, "page")}.`,
    ).then((done) => done && setMarks({}));
  };

  const start = selectedPages({ pages, selection })[0] ?? pages[0];

  return (
    <>
      <PanelSection title="Find text to redact">
        <Field label="Words or phrases (one per line)">
          <textarea
            rows={3}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={"Jane Doe\nProject Falcon"}
            className={inputClass}
          />
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm">Also find</legend>
          {(Object.keys(REDACTION_PATTERNS) as RedactionPattern[]).map((p) => (
            <Checkbox
              key={p}
              checked={patterns.includes(p)}
              onChange={(on) =>
                setPatterns((list) => (on ? [...list, p] : list.filter((x) => x !== p)))
              }
              label={REDACTION_PATTERNS[p].label}
            />
          ))}
        </fieldset>
        <Button
          className="w-full"
          disabled={!terms.trim() && patterns.length === 0}
          onClick={search}
        >
          <Search className="size-4" /> Find and mark
        </Button>
        {found && <p className="text-sm">{found}</p>}
      </PanelSection>
      <PanelSection
        title={
          markCount
            ? `${pluralize(markCount, "area")} on ${pluralize(pageCount, "page")}`
            : "Marked areas"
        }
      >
        <Button
          className="w-full"
          disabled={!start}
          onClick={() => setReviewing(pages.indexOf(start!))}
        >
          <Square className="size-4" /> Review and mark by hand
        </Button>
        <Checkbox
          checked={stripMetadata}
          onChange={setStripMetadata}
          label="Also remove all metadata (title, author…)"
        />
        <Button variant="primary" className="w-full" disabled={markCount === 0} onClick={apply}>
          <ShieldX className="size-4" /> Redact {markCount ? pluralize(markCount, "area") : ""}
        </Button>
        <Hint>
          Redacted pages are rebuilt as images with the black boxes burned in, so nothing under them
          can be recovered. Their remaining text stays searchable. Check bookmarks and the file name
          yourself: they aren't changed.
        </Hint>
      </PanelSection>
      {reviewing !== null && (
        <RedactDialog
          startIndex={reviewing}
          marks={live}
          onClose={(next) => {
            setMarks(next);
            setReviewing(null);
          }}
        />
      )}
    </>
  );
}

function RedactDialog({
  startIndex,
  marks: initial,
  onClose,
}: {
  startIndex: number;
  marks: Marks;
  onClose: (marks: Marks) => void;
}) {
  const pages = useWorkspace((s) => s.pages);
  const [index, setIndex] = useState(startIndex);
  const [marks, setMarks] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const page = pages[index]!;
  const preview = usePagePreview(page);
  const list = marks[page.id] ?? [];

  const setList = (next: Mark[]) => setMarks((m) => ({ ...m, [page.id]: next }));
  const go = (i: number) => {
    setSelected(null);
    setIndex(i);
  };
  // Pages with marks, for jumping between them.
  const marked = pages.flatMap((p, i) => (marks[p.id]?.length ? [i] : []));
  const nextMarked = marked.find((i) => i > index);
  const prevMarked = [...marked].reverse().find((i) => i < index);

  return (
    <PageDialog
      label={`Redact page ${index + 1}`}
      onCancel={() => onClose(marks)}
      toolbar={
        <>
          <div className="flex items-center">
            <Button
              variant="ghost"
              className="px-1.5"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-16 text-center text-sm">
              page {index + 1}/{pages.length}
            </span>
            <Button
              variant="ghost"
              className="px-1.5"
              disabled={index === pages.length - 1}
              onClick={() => go(index + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            disabled={prevMarked === undefined}
            onClick={() => go(prevMarked!)}
          >
            ← marked
          </Button>
          <Button
            variant="ghost"
            disabled={nextMarked === undefined}
            onClick={() => go(nextMarked!)}
          >
            marked →
          </Button>
          <span className="h-6 w-0.5 bg-ink" aria-hidden />
          <Button
            variant="ghost"
            onClick={() => {
              const mark = { id: uid(), x: 0.3, y: 0.4, width: 0.4, height: 0.05 };
              setList([...list, mark]);
              setSelected(mark.id);
            }}
          >
            <Square className="size-4" /> Mark area
          </Button>
          <Button
            variant="ghost"
            disabled={!selected}
            onClick={() => {
              setList(list.filter((m) => m.id !== selected));
              setSelected(null);
            }}
          >
            <Trash className="size-4" /> Unmark
          </Button>
          <Button variant="primary" className="ml-auto" onClick={() => onClose(marks)}>
            Done
          </Button>
        </>
      }
    >
      {!preview ? (
        <LoaderCircle className="mt-24 size-8 animate-spin text-paper" aria-label="Loading page" />
      ) : (
        <PageStage
          url={preview.url}
          aspect={preview.aspect}
          area={area}
          alt={`Page ${index + 1}`}
          onBackgroundPointerDown={() => setSelected(null)}
        >
          {list.map((m) => (
            <DraggableBox
              key={m.id}
              box={m}
              area={area}
              label="Redaction area"
              minSize={0.005}
              selected={m.id === selected}
              onSelect={() => setSelected(m.id)}
              onChange={(box) => setList(list.map((x) => (x.id === m.id ? { ...x, ...box } : x)))}
            >
              {/* See-through while reviewing; solid black once applied. */}
              <div className="size-full bg-ink/70" />
            </DraggableBox>
          ))}
        </PageStage>
      )}
    </PageDialog>
  );
}
