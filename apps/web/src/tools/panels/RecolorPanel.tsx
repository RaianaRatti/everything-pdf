import { Blend, Contrast, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { rasterizePages } from "../../lib/raster";
import { useWorkspace } from "../../store/workspace";
import { Button, Field, Hint, PanelSection, Segmented } from "../../components/ui";

type Scope = "all" | "selected";
type Dpi = "110" | "150" | "220";
type Filter = "invert" | "grayscale";

const copy: Record<
  Filter,
  { busy: string; progress: string; done: string; action: string; icon: LucideIcon }
> = {
  invert: {
    busy: "Inverting colors…",
    progress: "Inverting",
    done: "Colors inverted. Use undo if you want the original back.",
    action: "Invert colors",
    icon: Contrast,
  },
  grayscale: {
    busy: "Converting to grayscale…",
    progress: "Converting",
    done: "Pages converted to grayscale. Use undo if you want the original back.",
    action: "Convert to grayscale",
    icon: Blend,
  },
};

export const InvertPanel = () => <RecolorPanel filter="invert" />;
export const GrayscalePanel = () => <RecolorPanel filter="grayscale" />;

function RecolorPanel({ filter }: { filter: Filter }) {
  const { busy, progress, done, action, icon: Icon } = copy[filter];
  const selection = useWorkspace((s) => s.selection);
  const [scope, setScope] = useState<Scope>("all");
  const [dpi, setDpi] = useState<Dpi>("150");

  const run = () => {
    const { pages, files, setBusy } = useWorkspace.getState();
    const chosen = new Set(scope === "selected" ? selection : pages.map((p) => p.id));
    const targets = pages.flatMap((p, pageIndex) => (chosen.has(p.id) ? [{ p, pageIndex }] : []));

    void applyToDocument(
      busy,
      async (bytes) => {
        const images = await rasterizePages(
          targets.map((t) => t.p),
          files,
          {
            dpi: Number(dpi),
            format: "jpg",
            quality: 0.88,
            invert: filter === "invert",
            grayscale: filter === "grayscale",
            onProgress: (n, total) =>
              setBusy(`${progress} page ${Math.min(n + 1, total)} of ${total}…`),
          },
        );
        setBusy("Building PDF…");
        return engine.replacePagesWithImages(
          bytes,
          targets.map((t, i) => ({ pageIndex: t.pageIndex, bytes: images[i]!, type: "jpg" })),
        );
      },
      done,
    );
  };

  const disabled = scope === "selected" && selection.length === 0;

  return (
    <>
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
        <Field label="Quality">
          <Segmented
            label="Quality"
            value={dpi}
            onChange={setDpi}
            options={[
              { value: "110", label: "Smaller" },
              { value: "150", label: "Standard" },
              { value: "220", label: "Sharp" },
            ]}
          />
        </Field>
        <Hint>
          Converted pages are stored as images, so their text can't be selected or searched
          afterwards.
        </Hint>
        <Button variant="primary" className="w-full" disabled={disabled} onClick={run}>
          <Icon className="size-4" /> {action}
        </Button>
      </PanelSection>
    </>
  );
}
