import { ArrowDownUp, Copy, Download, RotateCcw, RotateCw, Scissors, Trash } from "lucide-react";
import { downloadSelection } from "../../lib/actions";
import { useWorkspace } from "../../store/workspace";
import { Button, Hint, PanelSection } from "../../components/ui";

export function SelectionHelp() {
  return (
    <Hint>
      Click a page to select it. Hold ⌘/Ctrl to add pages, or Shift to select a range. Drag pages to
      reorder them.
    </Hint>
  );
}

export function OrganizePanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const { rotate, remove, duplicate, keepOnly, setPages, setSelection } = useWorkspace.getState();
  const none = selection.length === 0;

  return (
    <>
      <PanelSection>
        <SelectionHelp />
      </PanelSection>
      <PanelSection title={none ? "Selected pages" : `Selected pages (${selection.length})`}>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={none} onClick={() => rotate(selection, -90)}>
            <RotateCcw className="size-4" /> Rotate left
          </Button>
          <Button disabled={none} onClick={() => rotate(selection, 90)}>
            <RotateCw className="size-4" /> Rotate right
          </Button>
          <Button disabled={none} onClick={() => duplicate(selection)}>
            <Copy className="size-4" /> Duplicate
          </Button>
          <Button variant="danger" disabled={none} onClick={() => remove(selection)}>
            <Trash className="size-4" /> Delete
          </Button>
          <Button disabled={none} onClick={() => keepOnly(selection)}>
            <Scissors className="size-4" /> Keep only
          </Button>
          <Button disabled={none} onClick={() => void downloadSelection()}>
            <Download className="size-4" /> Download
          </Button>
        </div>
      </PanelSection>
      <PanelSection title="All pages">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setSelection(pages.map((p) => p.id))}>Select all</Button>
          <Button onClick={() => setPages([...pages].reverse())}>
            <ArrowDownUp className="size-4" /> Reverse order
          </Button>
        </div>
      </PanelSection>
    </>
  );
}
