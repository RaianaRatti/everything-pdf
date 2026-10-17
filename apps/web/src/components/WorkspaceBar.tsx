import { Download, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { addFiles, downloadDocument } from "../lib/actions";
import { pluralize } from "../lib/files";
import { useWorkspace } from "../store/workspace";
import { FilePickerButton } from "./Dropzone";
import { Button, inputClass } from "./ui";

export function WorkspaceBar() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const canUndo = useWorkspace((s) => s.past.length > 0);
  const canRedo = useWorkspace((s) => s.future.length > 0);
  const outputName = useWorkspace((s) => s.outputName);
  const { undo, redo, reset, setOutputName } = useWorkspace.getState();

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-ink bg-card/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="flex">
        <Button
          variant="ghost"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
        >
          <Redo2 className="size-4" />
        </Button>
      </div>

      <input
        aria-label="File name"
        value={outputName}
        onChange={(e) => setOutputName(e.target.value)}
        className={`${inputClass} max-w-56 min-w-32 flex-1`}
      />

      <span className="text-sm text-ink-2">
        {pluralize(pages.length, "page")}
        {selection.length > 0 && ` · ${selection.length} selected`}
      </span>

      <div className="ml-auto flex gap-2">
        <FilePickerButton
          onFiles={addFiles}
          accept="application/pdf,.pdf,image/*"
          className="inline-flex items-center gap-2 rounded-md border-2 border-transparent px-3 py-2 text-sm text-ink hover:bg-accent"
        >
          <Plus className="size-4" /> Add files
        </FilePickerButton>
        <Button
          variant="ghost"
          onClick={reset}
          title="Clear all files now, without asking"
          aria-label="Clear all files"
        >
          <Trash2 className="size-4" />
        </Button>
        <Button variant="primary" onClick={() => void downloadDocument()}>
          <Download className="size-4" /> Download
        </Button>
      </div>
    </div>
  );
}
