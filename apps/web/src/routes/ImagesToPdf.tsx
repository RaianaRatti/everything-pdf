import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ImagesToPdfOptions } from "@everything-pdf/engine";
import { Download, FileOutput, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Dropzone, FilePickerButton } from "../components/Dropzone";
import { BusyOverlay, NoticeToast } from "../components/Overlays";
import { Button, Field, PanelSection, Segmented, inputClass } from "../components/ui";
import { errorMessage, runTask } from "../lib/actions";
import { downloadBytes } from "../lib/download";
import { engine } from "../lib/engine";
import { ensurePdfExtension, isImageFile, pluralize, uid } from "../lib/files";
import { prepareImage, type PreparedImage } from "../lib/images";
import { useWorkspace } from "../store/workspace";
import { findTool } from "../tools/registry";

interface Item extends PreparedImage {
  id: string;
  name: string;
  url: string;
}

type Margin = "0" | "18" | "36";

export function ImagesToPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<ImagesToPdfOptions["pageSize"]>("fit");
  const [orientation, setOrientation] = useState<ImagesToPdfOptions["orientation"]>("auto");
  const [margin, setMargin] = useState<Margin>("18");
  const [name, setName] = useState("images.pdf");
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    document.title = "Images to PDF · everything-pdf";
  }, []);

  // Release preview URLs when the page goes away.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const add = async (files: File[]) => {
    const errors: string[] = [];
    const added: Item[] = [];
    await runTask("Reading images…", async () => {
      for (const file of files) {
        if (!isImageFile(file)) {
          errors.push(`${file.name}: not an image.`);
          continue;
        }
        try {
          const prepared = await prepareImage(file);
          const url = URL.createObjectURL(
            new Blob([prepared.bytes as BlobPart], {
              type: prepared.type === "png" ? "image/png" : "image/jpeg",
            }),
          );
          added.push({ ...prepared, id: uid(), name: file.name, url });
        } catch (err) {
          errors.push(`${file.name}: ${errorMessage(err)}`);
        }
      }
    });
    setItems((prev) => [...prev, ...added]);
    if (errors.length)
      useWorkspace.getState().setNotice({ kind: "error", message: errors.join("\n") });
  };

  const build = () =>
    engine.imagesToPdf(
      items.map(({ bytes, type }) => ({ bytes, type })),
      { pageSize, orientation, margin: pageSize === "fit" ? 0 : Number(margin) },
    );

  const download = () =>
    runTask("Creating PDF…", async () => downloadBytes(await build(), ensurePdfExtension(name)));

  const openInWorkspace = () =>
    runTask("Creating PDF…", async () => {
      const bytes = await build();
      const ws = useWorkspace.getState();
      ws.reset();
      ws.addFiles([{ id: uid(), name: ensurePdfExtension(name), bytes, pageCount: items.length }]);
      void navigate("/organize");
    });

  return (
    <div className="flex min-h-dvh flex-col">
      <nav className="border-b-2 border-ink p-2">
        <Link
          to="/"
          aria-label="All tools"
          className="inline-block border-2 border-transparent px-3 py-1.5 hover:border-ink"
        >
          ←
        </Link>
      </nav>
      {items.length === 0 ? (
        <main className="flex-1 p-4 sm:p-8">
          <div className="mx-auto max-w-2xl pt-4 sm:pt-16">
            <Dropzone
              onFiles={(f) => void add(f)}
              accept="image/*"
              title="drop images here"
              subtitle={findTool("images-to-pdf")?.description}
            />
          </div>
        </main>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row">
          <main className="flex-1 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-sm text-ink-2">
                {pluralize(items.length, "image")} · drag to reorder
              </p>
              <FilePickerButton
                onFiles={(f) => void add(f)}
                accept="image/*"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-paper-3"
              >
                <Plus className="size-4" /> Add images
              </FilePickerButton>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) return;
                setItems((prev) =>
                  arrayMove(
                    prev,
                    prev.findIndex((i) => i.id === active.id),
                    prev.findIndex((i) => i.id === over.id),
                  ),
                );
              }}
            >
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
                  {items.map((item, i) => (
                    <ImageTile
                      key={item.id}
                      item={item}
                      number={i + 1}
                      onRemove={() => {
                        URL.revokeObjectURL(item.url);
                        setItems((prev) => prev.filter((p) => p.id !== item.id));
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </main>
          <aside className="shrink-0 border-t border-line bg-paper-2 lg:w-80 lg:border-t-0 lg:border-l">
            <PanelSection title="Page setup">
              <Field label="Page size">
                <Segmented
                  label="Page size"
                  value={pageSize}
                  onChange={setPageSize}
                  options={[
                    { value: "fit", label: "Same as image" },
                    { value: "a4", label: "A4" },
                    { value: "letter", label: "Letter" },
                  ]}
                />
              </Field>
              {pageSize !== "fit" && (
                <>
                  <Field label="Orientation">
                    <Segmented
                      label="Orientation"
                      value={orientation}
                      onChange={setOrientation}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "portrait", label: "Portrait" },
                        { value: "landscape", label: "Landscape" },
                      ]}
                    />
                  </Field>
                  <Field label="Margin">
                    <Segmented
                      label="Margin"
                      value={margin}
                      onChange={setMargin}
                      options={[
                        { value: "0", label: "None" },
                        { value: "18", label: "Small" },
                        { value: "36", label: "Large" },
                      ]}
                    />
                  </Field>
                </>
              )}
            </PanelSection>
            <PanelSection>
              <Field label="File name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Button variant="primary" className="w-full" onClick={() => void download()}>
                <Download className="size-4" /> Download PDF
              </Button>
              <Button className="w-full" onClick={() => void openInWorkspace()}>
                <FileOutput className="size-4" /> Keep editing as PDF
              </Button>
            </PanelSection>
          </aside>
        </div>
      )}
      <BusyOverlay />
      <NoticeToast />
    </div>
  );
}

function ImageTile({
  item,
  number,
  onRemove,
}: {
  item: Item;
  number: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`Image ${number}: ${item.name}`}
        className="cursor-grab bg-card p-2 border-2 border-ink active:cursor-grabbing"
      >
        <div className="flex aspect-square items-center justify-center">
          <img src={item.url} alt="" draggable={false} className="max-h-full max-w-full" />
        </div>
        <p className="mt-2 truncate text-center text-xs text-ink-2">
          {number}. {item.name}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="absolute top-3 right-3 bg-ink/80 p-1.5 text-paper opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-ink"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}
