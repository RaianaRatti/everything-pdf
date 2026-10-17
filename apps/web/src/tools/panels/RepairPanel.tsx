import { Download, Wrench } from "lucide-react";
import { Button, Hint, PanelSection } from "../../components/ui";
import { downloadDocument } from "../../lib/actions";
import { useWorkspace } from "../../store/workspace";

export function RepairPanel() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const repaired = [...new Set(pages.map((p) => p.fileId))]
    .map((id) => files[id]!)
    .filter((f) => f.repaired);

  return (
    <PanelSection>
      {repaired.length > 0 ? (
        <p className="flex items-start gap-2 text-sm">
          <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Repaired: {repaired.map((f) => f.name).join(", ")}. The download is a clean, rebuilt
            file.
          </span>
        </p>
      ) : (
        <Hint>
          Damaged files (a broken or missing cross-reference table, shifted data, a truncated end)
          are repaired automatically when you add them. None of these needed it, but downloading
          still writes a freshly rebuilt file.
        </Hint>
      )}
      <Button variant="primary" className="w-full" onClick={() => void downloadDocument()}>
        <Download className="size-4" /> Download rebuilt PDF
      </Button>
    </PanelSection>
  );
}
