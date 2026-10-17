import { planSplit, type SplitMode } from "@everything-pdf/engine/pure";
import { Download } from "lucide-react";
import { useState } from "react";
import { errorMessage, materialize, runTask } from "../../lib/actions";
import { downloadFiles } from "../../lib/download";
import { engine } from "../../lib/engine";
import { baseName, ensurePdfExtension, pluralize } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";
import { Button, Field, Hint, PanelSection, Segmented, inputClass } from "../../components/ui";

type Kind = SplitMode["kind"];

function describeGroup(pages: number[]): string {
  const first = pages[0]! + 1;
  const last = pages.at(-1)! + 1;
  return pages.length === 1 ? `page ${first}` : `pages ${first}-${last}`;
}

export function SplitPanel() {
  const pageCount = useWorkspace((s) => s.pages.length);
  const outputName = useWorkspace((s) => s.outputName);
  const [kind, setKind] = useState<Kind>("every");
  const [every, setEvery] = useState(2);
  const [ranges, setRanges] = useState("");

  const mode: SplitMode =
    kind === "single" ? { kind } : kind === "every" ? { kind, pages: every } : { kind, ranges };

  let groups: number[][] = [];
  let error: string | null = null;
  if (kind !== "ranges" || ranges.trim()) {
    try {
      groups = planSplit(mode, pageCount);
    } catch (err) {
      error = errorMessage(err);
    }
  }

  const run = () =>
    runTask(`Splitting into ${pluralize(groups.length, "file")}…`, async () => {
      const base = baseName(ensurePdfExtension(outputName));
      const parts = await engine.extractGroups(await materialize(), groups);
      downloadFiles(
        parts.map((p) => ({ name: `${base} (${describeGroup(p.pages)}).pdf`, bytes: p.bytes })),
        `${base}-split.zip`,
      );
    });

  return (
    <>
      <PanelSection>
        <Segmented
          label="How to split"
          value={kind}
          onChange={setKind}
          options={[
            { value: "every", label: "Every N" },
            { value: "single", label: "Every page" },
            { value: "ranges", label: "Custom" },
          ]}
        />
        {kind === "every" && (
          <Field label="Pages per file">
            <input
              type="number"
              min={1}
              max={Math.max(1, pageCount)}
              value={every}
              onChange={(e) => setEvery(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className={inputClass}
            />
          </Field>
        )}
        {kind === "ranges" && (
          <Field label="Ranges">
            <input
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              placeholder="e.g. 1-3, 4-8, 9-"
              className={inputClass}
            />
          </Field>
        )}
        {kind === "ranges" && <Hint>Each comma-separated range becomes its own file.</Hint>}
      </PanelSection>
      <PanelSection title="Result">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : groups.length === 0 ? (
          <Hint>Enter the ranges to split by.</Hint>
        ) : (
          <>
            <Hint>Creates {pluralize(groups.length, "file")}:</Hint>
            <ul className="max-h-48 space-y-1 overflow-auto text-sm text-ink">
              {groups.slice(0, 50).map((g, i) => (
                <li key={i}>
                  {i + 1}. {describeGroup(g)}
                </li>
              ))}
              {groups.length > 50 && <li>…and {groups.length - 50} more</li>}
            </ul>
          </>
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={!groups.length}
          onClick={() => void run()}
        >
          <Download className="size-4" />
          {""}
          {groups.length > 1 ? "Split & download ZIP" : "Split & download"}
        </Button>
      </PanelSection>
    </>
  );
}
