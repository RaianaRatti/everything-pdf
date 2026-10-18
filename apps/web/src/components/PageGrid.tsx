import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RotateCcw, RotateCw, Trash } from "lucide-react";
import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import { getThumbnail } from "../lib/thumbnails";
import { useWorkspace, type PageItem, type SelectMode } from "../store/workspace";

/** Colors that tell pages from different files apart. */
const FILE_COLORS = [
  "bg-[#7a8f3c]",
  "bg-[#c0763a]",
  "bg-[#4f7f8a]",
  "bg-[#9a5b7a]",
  "bg-[#b89a2a]",
  "bg-[#5c6a9a]",
  "bg-[#8a6a4a]",
  "bg-[#3f8a64]",
];

export function PageGrid() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const selection = useWorkspace((s) => s.selection);
  const movePage = useWorkspace((s) => s.movePage);
  const select = useWorkspace((s) => s.select);

  // Distance threshold so a plain click selects instead of starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fileOrder = [...new Set(pages.map((p) => p.fileId))];
  const showFileColors = fileOrder.length > 1;
  const selected = new Set(selection);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) movePage(String(active.id), String(over.id));
  };

  return (
    <div className="min-h-full p-4 sm:p-6">
      {showFileColors && (
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {fileOrder.map((id, i) => (
            <li key={id} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${FILE_COLORS[i % FILE_COLORS.length]}`} />
              {files[id]?.name}
            </li>
          ))}
        </ul>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <ul
            aria-label="Pages"
            className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]"
          >
            {pages.map((page, index) => (
              <PageThumb
                key={page.id}
                page={page}
                number={index + 1}
                selected={selected.has(page.id)}
                color={
                  showFileColors
                    ? FILE_COLORS[fileOrder.indexOf(page.fileId) % FILE_COLORS.length]
                    : undefined
                }
                onSelect={select}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function selectMode(e: MouseEvent): SelectMode {
  if (e.shiftKey) return "range";
  if (e.metaKey || e.ctrlKey) return "toggle";
  return "single";
}

const PageThumb = memo(function PageThumb({
  page,
  number,
  selected,
  color,
  onSelect,
}: {
  page: PageItem;
  number: number;
  selected: boolean;
  color?: string;
  onSelect: (id: string, mode: SelectMode) => void;
}) {
  const file = useWorkspace((s) => s.files[page.fileId]);
  const rotate = useWorkspace((s) => s.rotate);
  const remove = useWorkspace((s) => s.remove);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  const [src, setSrc] = useState<string>();
  const [visible, setVisible] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // Render thumbnails only once they scroll near the viewport.
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !file) return;
    let cancelled = false;
    getThumbnail(file.id, file.bytes, page.pageIndex, page.rotation)
      .then((url) => !cancelled && setSrc(url))
      .catch((err: unknown) => console.error("Thumbnail failed", err));
    return () => {
      cancelled = true;
    };
  }, [visible, file, page.pageIndex, page.rotation]);

  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`Page ${number}${selected ? ", selected" : ""}`}
        aria-pressed={selected}
        onClick={(e) => onSelect(page.id, selectMode(e))}
        className={`cursor-grab rounded-lg p-2.5 transition-colors active:cursor-grabbing ${
          selected ? "bg-accent ring-2 ring-ink" : "hover:bg-paper-3/70"
        }`}
      >
        <div ref={holder} className="flex aspect-[3/4] items-center justify-center">
          {src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="max-h-full max-w-full rounded-sm border-2 border-ink bg-card shadow-pop-sm"
            />
          ) : (
            <div className="size-full animate-pulse bg-paper-3" />
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-ink-2">
          {color && <span className={`size-2 rounded-full ${color}`} aria-hidden />}
          {number}
        </div>
      </div>

      <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {[
          { label: "Rotate left", icon: RotateCcw, run: () => rotate([page.id], -90) },
          { label: "Rotate right", icon: RotateCw, run: () => rotate([page.id], 90) },
          { label: "Delete page", icon: Trash, run: () => remove([page.id]) },
        ].map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={`${label} ${number}`}
            onPointerDown={stop}
            onClick={(e) => {
              stop(e);
              run();
            }}
            className="rounded-md border-2 border-ink bg-card p-1 text-ink hover:bg-accent"
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
    </li>
  );
});
