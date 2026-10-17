import { Download } from "lucide-react";
import { useState } from "react";
import { runTask } from "../../lib/actions";
import { downloadBytes } from "../../lib/download";
import { baseName, ensurePdfExtension } from "../../lib/files";
import { openPdf } from "../../lib/pdfjs";
import { selectedPages, useWorkspace } from "../../store/workspace";
import { Button, Checkbox, Field, Hint, PanelSection, Segmented } from "../../components/ui";

export function PdfToTextPanel() {
  const selection = useWorkspace((s) => s.selection);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [markPages, setMarkPages] = useState(true);

  const run = () => {
    const { pages, files, outputName, setBusy, setNotice } = useWorkspace.getState();
    const targets = scope === "all" ? pages : selectedPages({ pages, selection });
    void runTask("Reading text…", async () => {
      const chunks: string[] = [];
      for (const [i, page] of targets.entries()) {
        setBusy(`Reading page ${i + 1} of ${targets.length}…`);
        const file = files[page.fileId]!;
        const doc = await openPdf(file.id, file.bytes);
        const content = await (await doc.getPage(page.pageIndex + 1)).getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
          .join("")
          .trim();
        const n = pages.indexOf(page) + 1;
        chunks.push(markPages ? `--- Page ${n} ---\n\n${text}` : text);
      }

      if (chunks.every((c) => !c.replace(/^--- Page \d+ ---/, "").trim())) {
        setNotice({
          kind: "error",
          message: "No text found. These pages may be scanned images, which need OCR.",
        });
        return;
      }
      const name = `${baseName(ensurePdfExtension(outputName))}.txt`;
      downloadBytes(
        new TextEncoder().encode(chunks.join("\n\n") + "\n"),
        name,
        "text/plain;charset=utf-8",
      );
    });
  };

  return (
    <PanelSection>
      <Field label="Pages">
        <Segmented
          label="Pages"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All pages" },
            { value: "selected", label: `Selected (${selection.length})` },
          ]}
        />
      </Field>
      <Checkbox checked={markPages} onChange={setMarkPages} label="Mark where each page starts" />
      <Hint>Saves a plain .txt file. Layout, images and formatting aren't kept.</Hint>
      <Button
        variant="primary"
        className="w-full"
        disabled={scope === "selected" && selection.length === 0}
        onClick={run}
      >
        <Download className="size-4" /> Extract & download
      </Button>
    </PanelSection>
  );
}
