import { Crop, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { DraggableBox, PageDialog, PageStage, type Box } from "../../components/BoxEditor";
import { Button, Field, Hint, PanelSection, Segmented } from "../../components/ui";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { usePagePreview } from "../../lib/usePagePreview";
import { selectedPages, useWorkspace } from "../../store/workspace";

type Scope = "this" | "selected" | "all";

export function CropPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const [scope, setScope] = useState<Scope>("all");
  const [open, setOpen] = useState(false);
  const target = selectedPages({ pages, selection })[0] ?? pages[0];
  const targetNumber = target ? pages.indexOf(target) + 1 : 0;

  const apply = (rect: Box) => {
    setOpen(false);
    const chosen = new Set(selection);
    const indices =
      scope === "all"
        ? pages.map((_, i) => i)
        : scope === "selected"
          ? pages.flatMap((p, i) => (chosen.has(p.id) ? [i] : []))
          : [targetNumber - 1];
    void applyToDocument(
      "Cropping…",
      (bytes) =>
        engine.cropPages(
          bytes,
          indices.map((pageIndex) => ({ pageIndex, rect })),
        ),
      `Cropped ${indices.length === 1 ? "1 page" : `${indices.length} pages`}.`,
    );
  };

  return (
    <PanelSection>
      <Field label="Apply to">
        <Segmented
          label="Apply to"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All pages" },
            { value: "selected", label: `Selected (${selection.length})` },
            { value: "this", label: `Page ${targetNumber}` },
          ]}
        />
      </Field>
      <Hint>
        You'll draw the crop area on page {targetNumber}; the same area is cut from every page you
        apply it to. Select a different page in the grid to draw on that one.
      </Hint>
      <Hint>
        Cropping hides the cut-away parts. They're still in the file, so it isn't a way to remove
        sensitive content.
      </Hint>
      <Button
        variant="primary"
        className="w-full"
        disabled={!target || (scope === "selected" && selection.length === 0)}
        onClick={() => setOpen(true)}
      >
        <Crop className="size-4" /> Choose crop area
      </Button>
      {open && target && (
        <CropDialog pageNumber={targetNumber} onCancel={() => setOpen(false)} onApply={apply} />
      )}
    </PanelSection>
  );
}

function CropDialog({
  pageNumber,
  onCancel,
  onApply,
}: {
  pageNumber: number;
  onCancel: () => void;
  onApply: (rect: Box) => void;
}) {
  const page = useWorkspace((s) => s.pages[pageNumber - 1]);
  const preview = usePagePreview(page);
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ x: 0.08, y: 0.08, width: 0.84, height: 0.84 });

  return (
    <PageDialog
      label={`Crop page ${pageNumber}`}
      onCancel={onCancel}
      toolbar={
        <>
          <p className="text-sm">Drag the box and its corners to the area you want to keep.</p>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setBox({ x: 0, y: 0, width: 1, height: 1 })}>Reset</Button>
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={() => onApply(box)}>
              Crop
            </Button>
          </div>
        </>
      }
    >
      {!preview ? (
        <LoaderCircle className="mt-24 size-8 animate-spin text-paper" aria-label="Loading page" />
      ) : (
        <PageStage url={preview.url} aspect={preview.aspect} area={area} alt={`Page ${pageNumber}`}>
          {/* Dim everything outside the crop area. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-ink/50"
            style={{
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${box.x * 100}% ${box.y * 100}%, ${box.x * 100}% ${(box.y + box.height) * 100}%, ${(box.x + box.width) * 100}% ${(box.y + box.height) * 100}%, ${(box.x + box.width) * 100}% ${box.y * 100}%, ${box.x * 100}% ${box.y * 100}%)`,
            }}
          />
          <DraggableBox box={box} onChange={setBox} area={area} minSize={0.05} label="Crop area" />
        </PageStage>
      )}
    </PageDialog>
  );
}
