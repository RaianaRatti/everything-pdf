import { parsePageRanges } from "@everything-pdf/engine/pure";
import { Download, Scissors } from "lucide-react";
import { useState } from "react";
import { errorMessage, materialize, runTask } from "../../lib/actions";
import { downloadBytes } from "../../lib/download";
import { baseName, ensurePdfExtension, pluralize } from "../../lib/files";
import { selectedPages, useWorkspace, type PageItem } from "../../store/workspace";
import { Button, Field, Hint, PanelSection, Segmented, inputClass } from "../../components/ui";
import { SelectionHelp } from "./OrganizePanel";

type Source = "selection" | "ranges";

export function ExtractPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const outputName = useWorkspace((s) => s.outputName);
  const keepOnly = useWorkspace((s) => s.keepOnly);
  const [source, setSource] = useState<Source>("selection");
  const [ranges, setRanges] = useState("");

  let chosen: PageItem[] = [];
  let error: string | null = null;
  if (source === "selection") {
    chosen = selectedPages({ pages, selection });
  } else if (ranges.trim()) {
    try {
      chosen = parsePageRanges(ranges, pages.length)
        .flat()
        .map((i) => pages[i]!);
    } catch (err) {
      error = errorMessage(err);
    }
  }

  const download = () =>
    runTask("Extracting pages…", async () => {
      const name = `${baseName(ensurePdfExtension(outputName))}-extract.pdf`;
      downloadBytes(await materialize(chosen), name);
    });

  return (
    <>
      <PanelSection>
        <Segmented
          label="Pages to extract"
          value={source}
          onChange={setSource}
          options={[
            { value: "selection", label: "Selected pages" },
            { value: "ranges", label: "Page numbers" },
          ]}
        />
        {source === "selection" ? (
          <SelectionHelp />
        ) : (
          <Field label="Pages">
            <input
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              placeholder="e.g. 1-3, 7, 10-"
              className={inputClass}
            />
          </Field>
        )}
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <Hint>
            {chosen.length ? `${pluralize(chosen.length, "page")} chosen.` : "No pages chosen yet."}
          </Hint>
        )}
      </PanelSection>
      <PanelSection>
        <Button
          variant="primary"
          className="w-full"
          disabled={!chosen.length}
          onClick={() => void download()}
        >
          <Download className="size-4" /> Download as new PDF
        </Button>
        <Button
          className="w-full"
          disabled={!chosen.length}
          onClick={() => keepOnly(chosen.map((p) => p.id))}
        >
          <Scissors className="size-4" /> Keep only these pages here
        </Button>
      </PanelSection>
    </>
  );
}
