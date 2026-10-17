import { ImageDown } from "lucide-react";
import { Button, Hint, PanelSection } from "../../components/ui";
import { materialize, runTask } from "../../lib/actions";
import { downloadFiles } from "../../lib/download";
import { engine } from "../../lib/engine";
import { baseName, ensurePdfExtension, pluralize } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";

const TYPES = { jpg: "image/jpeg", png: "image/png", jp2: "image/jp2" } as const;

export function ExtractImagesPanel() {
  const run = () =>
    void runTask("Finding images…", async () => {
      const ws = useWorkspace.getState();
      const { images, skipped } = await engine.extractImages(await materialize());
      const skippedNote = skipped
        ? ` ${pluralize(skipped, "image")} in formats that can't be saved yet (e.g. CMYK or fax scans) ${skipped === 1 ? "was" : "were"} skipped.`
        : "";
      if (images.length === 0) {
        ws.setNotice({ kind: "error", message: `No images found.${skippedNote}` });
        return;
      }
      const base = baseName(ensurePdfExtension(ws.outputName));
      const perPage = new Map<number, number>();
      downloadFiles(
        images.map((image) => {
          const n = (perPage.get(image.page) ?? 0) + 1;
          perPage.set(image.page, n);
          return { name: `${base}-page-${image.page}-image-${n}.${image.ext}`, bytes: image.bytes };
        }),
        `${base}-images.zip`,
        images.length === 1 ? TYPES[images[0]!.ext] : undefined,
      );
      ws.setNotice({
        kind: "success",
        message: `Saved ${pluralize(images.length, "image")}.${skippedNote}`,
      });
    });

  return (
    <PanelSection>
      <Hint>
        Saves every photo and graphic embedded in the PDF. JPEGs come out exactly as they were
        stored; other images are saved as PNG. An image used on several pages is saved once.
      </Hint>
      <Hint>To save whole pages as pictures instead, use PDF to images.</Hint>
      <Button variant="primary" className="w-full" onClick={run}>
        <ImageDown className="size-4" /> Extract images
      </Button>
    </PanelSection>
  );
}
