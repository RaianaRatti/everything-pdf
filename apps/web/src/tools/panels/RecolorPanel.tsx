import { Blend, Contrast, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { rasterizePages } from "../../lib/raster";
import { useWorkspace } from "../../store/workspace";
import { Button, Checkbox, Field, Hint, PanelSection, Segmented } from "../../components/ui";

type Scope = "all" | "selected";
type Dpi = "110" | "150" | "220";
type Filter = "invert" | "grayscale";
/** Invert only: "vector" rewrites colors (text stays text), "image" renders pages. */
type Method = "vector" | "image";
type Style = "smart" | "invert";

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
  const [method, setMethod] = useState<Method>("vector");
  const [style, setStyle] = useState<Style>("smart");
  const [keepImages, setKeepImages] = useState(true);
  const vector = filter === "invert" && method === "vector";

  const run = () => {
    const { pages, files, setBusy } = useWorkspace.getState();
    const chosen = new Set(scope === "selected" ? selection : pages.map((p) => p.id));
    const targets = pages.flatMap((p, pageIndex) => (chosen.has(p.id) ? [{ p, pageIndex }] : []));

    if (vector) {
      void applyToDocument(
        busy,
        (bytes) =>
          engine.recolor(bytes, {
            mode: style,
            keepImages,
            pages: targets.map((t) => t.pageIndex),
          }),
        style === "smart" ? "Dark mode applied. Text is still selectable." : done,
      );
      return;
    }

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
        {filter === "invert" && (
          <Field label="Method">
            <Segmented
              label="Method"
              value={method}
              onChange={setMethod}
              options={[
                { value: "vector", label: "Keep text" },
                { value: "image", label: "As images" },
              ]}
            />
          </Field>
        )}
        {vector ? (
          <>
            <Field label="Style">
              <Segmented
                label="Style"
                value={style}
                onChange={(v) => {
                  setStyle(v);
                  setKeepImages(v === "smart");
                }}
                options={[
                  { value: "smart", label: "Dark mode" },
                  { value: "invert", label: "Negative" },
                ]}
              />
            </Field>
            <Checkbox
              checked={keepImages}
              onChange={setKeepImages}
              label="Leave photos as they are"
            />
            <Hint>
              {style === "smart"
                ? "Light backgrounds turn dark and text turns light, but colors keep their hue (red stays red). "
                : "A true negative: every color is flipped. "}
              Text stays selectable. Gradients and spot colors aren't changed; if a page looks off,
              use “As images” instead.
            </Hint>
          </>
        ) : (
          <>
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
              afterwards. Works on any PDF.
            </Hint>
          </>
        )}
        <Button variant="primary" className="w-full" disabled={disabled} onClick={run}>
          <Icon className="size-4" /> {action}
        </Button>
      </PanelSection>
    </>
  );
}
