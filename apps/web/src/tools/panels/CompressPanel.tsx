import { compressPresets } from "@everything-pdf/engine/pure";
import { Gauge, Minimize2 } from "lucide-react";
import { useState } from "react";
import { materialize, runTask, sourceFromBytes } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { downloadBytes } from "../../lib/download";
import { baseName, ensurePdfExtension, formatBytes } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";
import { Button, Hint, PanelSection } from "../../components/ui";

type Preset = keyof typeof compressPresets;

const PRESETS: { value: Preset; label: string; description: string }[] = [
  { value: "lossless", label: "Lossless", description: "Same quality; repacks the file only" },
  { value: "low", label: "Light", description: "Best quality, modest savings" },
  { value: "medium", label: "Balanced", description: "Good quality, good savings" },
  { value: "high", label: "Strong", description: "Smallest file, lower image quality" },
];

export function CompressPanel() {
  const [preset, setPreset] = useState<Preset>("medium");
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setResult(null);
    await runTask("Compressing…", async () => {
      const bytes = await materialize();
      const r = await engine.compress(bytes, compressPresets[preset]);
      if (r.newSize >= r.originalSize) {
        setResult(
          `This PDF is already compact (${formatBytes(r.originalSize)}), so nothing was changed.`,
        );
        return;
      }
      useWorkspace.getState().replaceDocument(await sourceFromBytes(r.bytes));
      const saved = Math.round((1 - r.newSize / r.originalSize) * 100);
      setResult(
        `Reduced from ${formatBytes(r.originalSize)} to ${formatBytes(r.newSize)} (${saved}% smaller).`,
      );
    });
  };

  return (
    <>
      <PanelSection title="Level">
        <div role="radiogroup" aria-label="Compression level" className="space-y-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={`w-full p-3 text-left ring-2 transition-colors ${
                preset === p.value
                  ? "bg-paper-3 ring-ink"
                  : "bg-card ring-line hover:ring-line-strong"
              }`}
            >
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-xs text-ink-2">{p.description}</p>
            </button>
          ))}
        </div>
        <Button variant="primary" className="w-full" onClick={() => void run()}>
          <Minimize2 className="size-4" /> Compress
        </Button>
        {result && <p className="text-sm text-ink">{result}</p>}
      </PanelSection>
      <PanelSection title="For the web">
        <Hint>
          Downloads a copy reordered so browsers can show the first page while the rest is still
          loading (“fast web view”). Useful for big files you put online.
        </Hint>
        <Button
          className="w-full"
          onClick={() =>
            void runTask("Optimizing for the web…", async () => {
              const ws = useWorkspace.getState();
              const bytes = await engine.linearize(await materialize());
              downloadBytes(bytes, `${baseName(ensurePdfExtension(ws.outputName))}-web.pdf`);
            })
          }
        >
          <Gauge className="size-4" /> Download for fast web view
        </Button>
      </PanelSection>
    </>
  );
}
