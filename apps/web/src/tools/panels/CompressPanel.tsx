import { compressPresets } from "@everything-pdf/engine/pure";
import { Minimize2 } from "lucide-react";
import { useState } from "react";
import { materialize, runTask } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { formatBytes, uid } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";
import { Button, PanelSection } from "../../components/ui";

type Preset = keyof typeof compressPresets;

const PRESETS: { value: Preset; label: string; description: string }[] = [
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
      const { pageCount } = await engine.inspect(r.bytes);
      const ws = useWorkspace.getState();
      ws.replaceDocument({ id: uid(), name: ws.outputName, bytes: r.bytes, pageCount });
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
    </>
  );
}
