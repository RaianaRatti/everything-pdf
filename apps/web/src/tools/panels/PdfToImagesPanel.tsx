import { Download } from "lucide-react";
import { useState } from "react";
import { runTask } from "../../lib/actions";
import { downloadFiles } from "../../lib/download";
import { baseName, ensurePdfExtension } from "../../lib/files";
import { rasterizePages } from "../../lib/raster";
import { selectedPages, useWorkspace } from "../../store/workspace";
import { Button, Field, PanelSection, Segmented } from "../../components/ui";

type Format = "png" | "jpg";
type Dpi = "72" | "150" | "300";

export function PdfToImagesPanel() {
  const selection = useWorkspace((s) => s.selection);
  const [format, setFormat] = useState<Format>("png");
  const [dpi, setDpi] = useState<Dpi>("150");
  const [scope, setScope] = useState<"all" | "selected">("all");

  const run = () => {
    const { pages, files, outputName, setBusy } = useWorkspace.getState();
    const targets = scope === "all" ? pages : selectedPages({ pages, selection });
    void runTask("Rendering pages…", async () => {
      const images = await rasterizePages(targets, files, {
        dpi: Number(dpi),
        format,
        quality: 0.92,
        onProgress: (done, total) =>
          setBusy(`Rendering page ${Math.min(done + 1, total)} of ${total}…`),
      });
      const base = baseName(ensurePdfExtension(outputName));
      const width = String(pages.length).length;
      downloadFiles(
        images.map((bytes, i) => {
          const n = pages.indexOf(targets[i]!) + 1;
          return { name: `${base}-page-${String(n).padStart(width, "0")}.${format}`, bytes };
        }),
        `${base}-images.zip`,
        format === "png" ? "image/png" : "image/jpeg",
      );
    });
  };

  return (
    <PanelSection>
      <Field label="Format">
        <Segmented
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: "png", label: "PNG" },
            { value: "jpg", label: "JPG" },
          ]}
        />
      </Field>
      <Field label="Resolution">
        <Segmented
          label="Resolution"
          value={dpi}
          onChange={setDpi}
          options={[
            { value: "72", label: "Screen" },
            { value: "150", label: "Standard" },
            { value: "300", label: "Print" },
          ]}
        />
      </Field>
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
      <Button
        variant="primary"
        className="w-full"
        disabled={scope === "selected" && selection.length === 0}
        onClick={run}
      >
        <Download className="size-4" /> Convert & download
      </Button>
    </PanelSection>
  );
}
