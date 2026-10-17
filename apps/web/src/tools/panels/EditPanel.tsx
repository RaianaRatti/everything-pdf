import type { Color, EditObject } from "@everything-pdf/engine";
import type { FontFamily } from "@everything-pdf/engine/pure";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Highlighter,
  ImagePlus,
  LoaderCircle,
  SquarePen,
  StickyNote,
  Trash,
  Type,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DraggableBox, PageDialog, PageStage, type Box } from "../../components/BoxEditor";
import { FilePickerButton } from "../../components/Dropzone";
import { Button, Hint, PanelSection, inputClass } from "../../components/ui";
import { applyToDocument, errorMessage } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { uid } from "../../lib/files";
import { prepareImage, type PreparedImage } from "../../lib/images";
import { usePagePreview } from "../../lib/usePagePreview";
import { selectedPages, useWorkspace } from "../../store/workspace";

type Item =
  | {
      id: string;
      kind: "text";
      box: Box;
      text: string;
      fontSize: number;
      font: FontFamily;
      bold: boolean;
      color: Color;
    }
  | { id: string; kind: "image"; box: Box; image: PreparedImage; url: string }
  | { id: string; kind: "whiteout"; box: Box; color: Color }
  | { id: string; kind: "highlight"; box: Box; color: Color; comment: string }
  | { id: string; kind: "note"; box: Box; text: string; color: Color };

const css = (c: Color) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

const TEXT_COLORS: { label: string; value: Color }[] = [
  { label: "Black", value: [0, 0, 0] },
  { label: "Blue", value: [0.1, 0.25, 0.75] },
  { label: "Red", value: [0.8, 0.1, 0.1] },
  { label: "Gray", value: [0.45, 0.45, 0.45] },
];
const HIGHLIGHT_COLORS: { label: string; value: Color }[] = [
  { label: "Yellow", value: [1, 0.92, 0.23] },
  { label: "Green", value: [0.55, 0.93, 0.45] },
  { label: "Pink", value: [1, 0.6, 0.8] },
  { label: "Blue", value: [0.55, 0.8, 1] },
];
const FONT_CSS: Record<FontFamily, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
};

export function EditPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const [open, setOpen] = useState(false);
  const start = selectedPages({ pages, selection })[0] ?? pages[0];

  return (
    <PanelSection>
      <Hint>
        Add text and images, cover things up with whiteout, highlight passages, or leave sticky
        notes. You can move between pages in the editor.
      </Hint>
      <Hint>
        Whiteout only hides what's underneath; the original text is still in the file. Don't use it
        to remove sensitive information.
      </Hint>
      <Button variant="primary" className="w-full" disabled={!start} onClick={() => setOpen(true)}>
        <SquarePen className="size-4" /> Edit page {start ? pages.indexOf(start) + 1 : ""}
      </Button>
      {open && start && (
        <PageEditor startIndex={pages.indexOf(start)} onClose={() => setOpen(false)} />
      )}
    </PanelSection>
  );
}

function PageEditor({ startIndex, onClose }: { startIndex: number; onClose: () => void }) {
  const pages = useWorkspace((s) => s.pages);
  const [index, setIndex] = useState(startIndex);
  const [edits, setEdits] = useState<Record<number, Item[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const preview = usePagePreview(pages[index]);
  const [areaWidth, setAreaWidth] = useState(0);

  // Track the displayed page width so text previews at the right size.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setAreaWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview]);

  // Release image URLs on close.
  const editsRef = useRef(edits);
  useEffect(() => {
    editsRef.current = edits;
  });
  useEffect(
    () => () =>
      Object.values(editsRef.current)
        .flat()
        .forEach((i) => i.kind === "image" && URL.revokeObjectURL(i.url)),
    [],
  );

  const items = edits[index] ?? [];
  const selected = items.find((i) => i.id === selectedId);
  const total = Object.values(edits).reduce((n, list) => n + list.length, 0);
  const ptToPx = preview && areaWidth ? areaWidth / preview.widthPt : 1;

  const setItems = (update: (items: Item[]) => Item[]) =>
    setEdits((all) => ({ ...all, [index]: update(all[index] ?? []) }));
  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)));
  const add = (item: Item) => {
    setItems((list) => [...list, item]);
    setSelectedId(item.id);
  };
  const remove = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.kind === "image") URL.revokeObjectURL(item.url);
    setItems((list) => list.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  /** Box height that fits a text item's lines, as a fraction of the page. */
  const textHeight = (text: string, fontSize: number) =>
    preview
      ? Math.min(1, (Math.max(1, text.split("\n").length) * fontSize * 1.2) / preview.heightPt)
      : 0.05;

  const addText = () => {
    const fontSize = 14;
    add({
      id: uid(),
      kind: "text",
      box: { x: 0.1, y: 0.1, width: 0.4, height: textHeight("Text", fontSize) },
      text: "Text",
      fontSize,
      font: "sans",
      bold: false,
      color: [0, 0, 0],
    });
  };

  const addImage = async (files: File[]) => {
    const file = files[0];
    if (!file || !preview) return;
    try {
      const image = await prepareImage(file);
      const width = 0.3;
      const height = Math.min(0.8, (width * preview.aspect * image.height) / image.width);
      add({
        id: uid(),
        kind: "image",
        box: {
          x: 0.35,
          y: 0.3,
          width: (height * image.width) / image.height / preview.aspect,
          height,
        },
        image,
        // Prepared bytes have the photo's orientation applied, matching what gets embedded.
        url: URL.createObjectURL(
          new Blob([image.bytes as BlobPart], {
            type: image.type === "png" ? "image/png" : "image/jpeg",
          }),
        ),
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const noteBox = (x: number, y: number): Box =>
    preview
      ? { x, y, width: 20 / preview.widthPt, height: 20 / preview.heightPt }
      : { x, y, width: 0.04, height: 0.03 };

  const apply = () => {
    const list = Object.entries(edits)
      .map(([pageIndex, objects]) => ({
        pageIndex: Number(pageIndex),
        objects: objects.map(toEdit),
      }))
      .filter((e) => e.objects.length > 0);
    if (list.length === 0) return onClose();
    onClose();
    void applyToDocument(
      "Applying edits…",
      (bytes) => engine.applyEdits(bytes, list),
      `Edits applied to ${list.length === 1 ? "1 page" : `${list.length} pages`}.`,
    );
  };

  const goTo = (next: number) => {
    setSelectedId(null);
    setIndex(next);
  };

  return (
    <PageDialog
      label={`Edit page ${index + 1}`}
      onCancel={onClose}
      toolbar={
        <>
          <div className="flex items-center">
            <Button
              variant="ghost"
              className="px-1.5"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
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
              onClick={() => goTo(index + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="h-6 w-0.5 bg-ink" aria-hidden />
          <ToolButton icon={<Type className="size-4" />} label="Text" onClick={addText} />
          <FilePickerButton
            onFiles={(f) => void addImage(f)}
            accept="image/*"
            className="inline-flex items-center gap-2 border-2 border-transparent px-2.5 py-2 text-sm hover:border-ink"
          >
            <ImagePlus className="size-4" /> Image
          </FilePickerButton>
          <ToolButton
            icon={<Eraser className="size-4" />}
            label="Whiteout"
            onClick={() =>
              add({
                id: uid(),
                kind: "whiteout",
                box: { x: 0.3, y: 0.3, width: 0.3, height: 0.06 },
                color: [1, 1, 1],
              })
            }
          />
          <ToolButton
            icon={<Highlighter className="size-4" />}
            label="Highlight"
            onClick={() =>
              add({
                id: uid(),
                kind: "highlight",
                box: { x: 0.1, y: 0.3, width: 0.5, height: 0.025 },
                color: HIGHLIGHT_COLORS[0]!.value,
                comment: "",
              })
            }
          />
          <ToolButton
            icon={<StickyNote className="size-4" />}
            label="Note"
            onClick={() =>
              add({
                id: uid(),
                kind: "note",
                box: noteBox(0.85, 0.05),
                text: "",
                color: [1, 0.85, 0.2],
              })
            }
          />
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={total === 0} onClick={apply}>
              Apply{total ? ` (${total})` : ""}
            </Button>
          </div>
          {selected && (
            <div className="flex w-full flex-wrap items-center gap-2 border-t-2 border-ink pt-2">
              <ItemProperties
                item={selected}
                onChange={(patch) => updateItem(selected.id, patch)}
                textHeight={textHeight}
              />
              <Button variant="ghost" className="ml-auto" onClick={() => remove(selected.id)}>
                <Trash className="size-4" /> Remove
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="w-full text-sm text-red-600">
              {error}
            </p>
          )}
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
          onBackgroundPointerDown={() => setSelectedId(null)}
        >
          {items.map((item) => (
            <DraggableBox
              key={item.id}
              box={item.box}
              area={area}
              label={`${item.kind} on page ${index + 1}`}
              selected={item.id === selectedId}
              onSelect={() => setSelectedId(item.id)}
              onChange={(box) => updateItem(item.id, { box })}
              resizable={item.kind !== "note"}
              ratio={
                item.kind === "image"
                  ? (item.image.height / item.image.width) * preview.aspect
                  : undefined
              }
            >
              <ItemView item={item} ptToPx={ptToPx} />
            </DraggableBox>
          ))}
        </PageStage>
      )}
    </PageDialog>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" className="px-2.5" onClick={onClick}>
      {icon} {label}
    </Button>
  );
}

/** How an item looks on the page preview. */
function ItemView({ item, ptToPx }: { item: Item; ptToPx: number }) {
  switch (item.kind) {
    case "text":
      return (
        <div
          className="size-full overflow-visible leading-[1.2] whitespace-pre"
          style={{
            fontFamily: FONT_CSS[item.font],
            fontSize: item.fontSize * ptToPx,
            fontWeight: item.bold ? 700 : 400,
            color: css(item.color),
          }}
        >
          {item.text || " "}
        </div>
      );
    case "image":
      return <img src={item.url} alt="" className="size-full" draggable={false} />;
    case "whiteout":
      return <div className="size-full" style={{ background: css(item.color) }} />;
    case "highlight":
      return (
        <div
          className="size-full opacity-60 mix-blend-multiply"
          style={{ background: css(item.color) }}
        />
      );
    case "note":
      return (
        <div
          className="flex size-full items-center justify-center border border-ink"
          style={{ background: css(item.color) }}
          title={item.text}
        >
          <StickyNote className="size-3/4" aria-hidden />
        </div>
      );
  }
}

function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: { label: string; value: Color }[];
  value: Color;
  onChange: (c: Color) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex gap-1">
      {colors.map((c) => (
        <button
          key={c.label}
          type="button"
          role="radio"
          aria-checked={c.value.join() === value.join()}
          aria-label={c.label}
          title={c.label}
          onClick={() => onChange(c.value)}
          className={`size-6 border-2 ${c.value.join() === value.join() ? "border-ink ring-2 ring-ink ring-offset-1" : "border-ink-3"}`}
          style={{ background: css(c.value) }}
        />
      ))}
    </div>
  );
}

/** Settings for the selected item, shown in the toolbar. */
function ItemProperties({
  item,
  onChange,
  textHeight,
}: {
  item: Item;
  onChange: (patch: Partial<Item>) => void;
  textHeight: (text: string, fontSize: number) => number;
}) {
  const small = `${inputClass} w-auto py-1`;
  switch (item.kind) {
    case "text":
      return (
        <>
          <textarea
            aria-label="Text"
            autoFocus
            rows={Math.min(4, item.text.split("\n").length)}
            value={item.text}
            onChange={(e) =>
              onChange({
                text: e.target.value,
                box: { ...item.box, height: textHeight(e.target.value, item.fontSize) },
              })
            }
            className={`${inputClass} min-w-48 flex-1 py-1`}
          />
          <select
            aria-label="Font"
            value={item.font}
            onChange={(e) => onChange({ font: e.target.value as FontFamily })}
            className={small}
          >
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="mono">Mono</option>
          </select>
          <select
            aria-label="Size"
            value={item.fontSize}
            onChange={(e) => {
              const fontSize = Number(e.target.value);
              onChange({ fontSize, box: { ...item.box, height: textHeight(item.text, fontSize) } });
            }}
            className={small}
          >
            {[8, 10, 12, 14, 18, 24, 32, 48].map((s) => (
              <option key={s} value={s}>
                {s} pt
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={item.bold}
              onChange={(e) => onChange({ bold: e.target.checked })}
              className="size-4 accent-black"
            />
            Bold
          </label>
          <Swatches
            colors={TEXT_COLORS}
            value={item.color}
            onChange={(color) => onChange({ color })}
          />
        </>
      );
    case "whiteout":
      return (
        <Swatches
          colors={[
            { label: "White", value: [1, 1, 1] },
            { label: "Black", value: [0, 0, 0] },
          ]}
          value={item.color}
          onChange={(color) => onChange({ color })}
        />
      );
    case "highlight":
      return (
        <>
          <Swatches
            colors={HIGHLIGHT_COLORS}
            value={item.color}
            onChange={(color) => onChange({ color })}
          />
          <input
            aria-label="Comment (optional)"
            placeholder="Comment (optional)"
            value={item.comment}
            onChange={(e) => onChange({ comment: e.target.value })}
            className={`${inputClass} min-w-48 flex-1 py-1`}
          />
        </>
      );
    case "note":
      return (
        <textarea
          aria-label="Note"
          placeholder="Write your note…"
          autoFocus
          rows={2}
          value={item.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className={`${inputClass} min-w-48 flex-1 py-1`}
        />
      );
    case "image":
      return <span className="text-sm text-ink-2">Drag the corners to resize.</span>;
  }
}

function toEdit(item: Item): EditObject {
  switch (item.kind) {
    case "text":
      return {
        kind: "text",
        box: item.box,
        text: item.text,
        fontSize: item.fontSize,
        font: item.font,
        bold: item.bold,
        color: item.color,
      };
    case "image":
      return {
        kind: "image",
        box: item.box,
        image: { bytes: item.image.bytes, type: item.image.type },
      };
    case "whiteout":
      return { kind: "whiteout", box: item.box, color: item.color };
    case "highlight":
      return {
        kind: "highlight",
        box: item.box,
        color: item.color,
        comment: item.comment || undefined,
      };
    case "note":
      return { kind: "note", box: item.box, text: item.text, color: item.color };
  }
}
