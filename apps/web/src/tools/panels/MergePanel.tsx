import { ChevronDown, ChevronUp, Download, Plus, X } from "lucide-react";
import { addFiles, downloadDocument } from "../../lib/actions";
import { pluralize } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";
import { FilePickerButton } from "../../components/Dropzone";
import { Button, Hint, PanelSection } from "../../components/ui";

export function MergePanel() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const setPages = useWorkspace((s) => s.setPages);

  const order = [...new Set(pages.map((p) => p.fileId))];
  const counts = new Map<string, number>();
  for (const p of pages) counts.set(p.fileId, (counts.get(p.fileId) ?? 0) + 1);

  /** Regroups pages by file in the new file order, keeping page order within each file. */
  const applyOrder = (fileIds: string[]) => {
    const rank = new Map(fileIds.map((id, i) => [id, i]));
    setPages([...pages].sort((a, b) => rank.get(a.fileId)! - rank.get(b.fileId)!));
  };

  const move = (index: number, delta: number) => {
    const next = [...order];
    const [id] = next.splice(index, 1);
    next.splice(index + delta, 0, id!);
    applyOrder(next);
  };

  return (
    <>
      <PanelSection title="Files, in order">
        <ol className="space-y-2">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 bg-card p-2 pl-3 border-2 border-ink">
              <span className="w-4 text-xs font-semibold text-ink-3">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{files[id]?.name}</p>
                <p className="text-xs text-ink-3">{pluralize(counts.get(id) ?? 0, "page")}</p>
              </div>
              <Button
                variant="ghost"
                className="px-1.5"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Move up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="px-1.5"
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="px-1.5"
                onClick={() => setPages(pages.filter((p) => p.fileId !== id))}
                aria-label={`Remove ${files[id]?.name}`}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
        <FilePickerButton
          onFiles={addFiles}
          accept="application/pdf,.pdf,image/*"
          className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-line-strong py-2.5 text-sm text-ink-2 hover:border-ink hover:text-ink"
        >
          <Plus className="size-4" /> Add more files
        </FilePickerButton>
        <Hint>You can also drag individual pages in the grid to mix files together.</Hint>
      </PanelSection>
      <PanelSection>
        <Button variant="primary" className="w-full" onClick={() => void downloadDocument()}>
          <Download className="size-4" /> Download merged PDF
        </Button>
      </PanelSection>
    </>
  );
}
