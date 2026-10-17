import { RotateCcw, RotateCw } from "lucide-react";
import { useWorkspace } from "../../store/workspace";
import { Button, Hint, PanelSection } from "../../components/ui";

function RotateButtons({ ids }: { ids: string[] }) {
  const rotate = useWorkspace((s) => s.rotate);
  const disabled = ids.length === 0;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Button disabled={disabled} onClick={() => rotate(ids, -90)} aria-label="Rotate left">
        <RotateCcw className="size-4" /> 90°
      </Button>
      <Button disabled={disabled} onClick={() => rotate(ids, 180)}>
        180°
      </Button>
      <Button disabled={disabled} onClick={() => rotate(ids, 90)} aria-label="Rotate right">
        <RotateCw className="size-4" /> 90°
      </Button>
    </div>
  );
}

export function RotatePanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);

  return (
    <>
      <PanelSection title="All pages">
        <RotateButtons ids={pages.map((p) => p.id)} />
      </PanelSection>
      <PanelSection
        title={selection.length ? `Selected pages (${selection.length})` : "Selected pages"}
      >
        <RotateButtons ids={selection} />
        <Hint>Select pages in the grid to rotate only those, or use the buttons on each page.</Hint>
      </PanelSection>
    </>
  );
}
