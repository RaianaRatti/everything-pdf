import { PAPER_SIZES } from "@everything-pdf/engine/pure";
import { FilePlus, Plus } from "lucide-react";
import { useState } from "react";
import { FilePickerButton } from "../../components/Dropzone";
import { Button, Field, Hint, PanelSection, Segmented, inputClass } from "../../components/ui";
import { insertFiles, runTask } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { uid } from "../../lib/files";
import { openPdf, pageSizeInPoints } from "../../lib/pdfjs";
import { useWorkspace } from "../../store/workspace";

type Position = "after" | "before" | "start" | "end";
type BlankSize = "match" | "a4" | "letter";

/** Index in the page list to insert at, relative to the selection. */
function insertIndex(position: Position): number {
  const { pages, selection } = useWorkspace.getState();
  const chosen = new Set(selection);
  const indices = pages.flatMap((p, i) => (chosen.has(p.id) ? [i] : []));
  switch (position) {
    case "start":
      return 0;
    case "end":
      return pages.length;
    case "before":
      return indices.length ? Math.min(...indices) : 0;
    case "after":
      return indices.length ? Math.max(...indices) + 1 : pages.length;
  }
}

export function InsertPanel() {
  const selection = useWorkspace((s) => s.selection);
  const [position, setPosition] = useState<Position>("after");
  const [size, setSize] = useState<BlankSize>("match");
  const [count, setCount] = useState(1);
  const none = selection.length === 0;
  const effective: Position =
    none && (position === "after" || position === "before") ? "end" : position;

  const addBlank = () =>
    void runTask("Adding blank pages…", async () => {
      const at = insertIndex(effective);
      const { pages, files } = useWorkspace.getState();
      let width: number, height: number;
      const neighbor = pages[Math.max(0, at - 1)];
      if (size === "match" && neighbor) {
        const file = files[neighbor.fileId]!;
        ({ width, height } = await pageSizeInPoints(
          await openPdf(file.id, file.bytes),
          neighbor.pageIndex,
          neighbor.rotation,
        ));
      } else {
        [width, height] = PAPER_SIZES[size === "letter" ? "letter" : "a4"];
      }
      const bytes = await engine.blankPdf(width, height, count);
      useWorkspace
        .getState()
        .insertFiles([{ id: uid(), name: "blank pages", bytes, pageCount: count }], at);
    });

  return (
    <>
      <PanelSection title="Where">
        <select
          aria-label="Where to insert"
          value={position}
          onChange={(e) => setPosition(e.target.value as Position)}
          className={inputClass}
        >
          <option value="after">After the selected pages</option>
          <option value="before">Before the selected pages</option>
          <option value="start">At the start</option>
          <option value="end">At the end</option>
        </select>
        {none && (position === "after" || position === "before") && (
          <Hint>No pages are selected, so new pages go at the end.</Hint>
        )}
      </PanelSection>
      <PanelSection title="Blank pages">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Size">
            <Segmented
              label="Size"
              value={size}
              onChange={setSize}
              options={[
                { value: "match", label: "Match" },
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
              ]}
            />
          </Field>
          <Field label="How many">
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) =>
                setCount(Math.min(100, Math.max(1, Math.floor(Number(e.target.value) || 1))))
              }
              className={`${inputClass} w-20`}
            />
          </Field>
        </div>
        <Button variant="primary" className="w-full" onClick={addBlank}>
          <Plus className="size-4" /> Insert {count === 1 ? "blank page" : `${count} blank pages`}
        </Button>
      </PanelSection>
      <PanelSection title="Pages from another file">
        <FilePickerButton
          onFiles={(files) => void insertFiles(files, insertIndex(effective))}
          accept="application/pdf,.pdf,image/*"
          className="flex w-full items-center justify-center gap-2 border-2 border-ink px-3 py-2 text-sm hover:bg-ink hover:text-paper"
        >
          <FilePlus className="size-4" /> Choose PDF or images…
        </FilePickerButton>
        <Hint>
          The new pages are selected afterwards, so you can move or rotate them right away.
        </Hint>
      </PanelSection>
    </>
  );
}
