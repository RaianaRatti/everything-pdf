import type { OcrWord, PageText } from "@everything-pdf/engine";
import { ScanText } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  Hint,
  PanelSection,
  Segmented,
  inputClass,
} from "../../components/ui";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { pluralize } from "../../lib/files";
import { recognizePages } from "../../lib/ocr";
import { openPdf } from "../../lib/pdfjs";
import { useWorkspace, type PageItem, type SourceFile } from "../../store/workspace";

const LANGUAGES = [
  { value: "eng", label: "English" },
  { value: "por", label: "Portuguese" },
  { value: "spa", label: "Spanish" },
  { value: "fra", label: "French" },
  { value: "deu", label: "German" },
  { value: "ita", label: "Italian" },
  { value: "nld", label: "Dutch" },
  { value: "pol", label: "Polish" },
  { value: "tur", label: "Turkish" },
  { value: "swe", label: "Swedish" },
];

/** True if pdf.js finds real text on the page, i.e. it doesn't need OCR. */
async function hasText(page: PageItem, files: Record<string, SourceFile>): Promise<boolean> {
  const file = files[page.fileId]!;
  const doc = await openPdf(file.id, file.bytes);
  const content = await (await doc.getPage(page.pageIndex + 1)).getTextContent();
  const chars = content.items.reduce(
    (n, item) => n + ("str" in item ? item.str.trim().length : 0),
    0,
  );
  return chars > 20;
}

export function OcrPanel() {
  const selection = useWorkspace((s) => s.selection);
  const [language, setLanguage] = useState("eng");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [skipText, setSkipText] = useState(true);

  const run = () => {
    const { pages, files, setBusy } = useWorkspace.getState();
    const chosen = new Set(scope === "selected" ? selection : pages.map((p) => p.id));
    let recognized = 0;
    let skipped = 0;

    void applyToDocument("Preparing OCR…", async (bytes) => {
      const targets: { page: PageItem; pageIndex: number }[] = [];
      for (const [pageIndex, page] of pages.entries()) {
        if (!chosen.has(page.id)) continue;
        if (skipText && (await hasText(page, files))) skipped++;
        else targets.push({ page, pageIndex });
      }
      if (targets.length === 0) return bytes;

      const words: OcrWord[][] = await recognizePages(
        targets.map((t) => t.page),
        files,
        language,
        (message) => setBusy(message),
      );
      recognized = targets.length;
      setBusy("Adding searchable text…");
      const layer: PageText[] = targets.map((t, i) => ({
        pageIndex: t.pageIndex,
        words: words[i]!,
      }));
      return engine.addTextLayer(bytes, layer);
    }).then((done) => {
      if (!done) return;
      const parts = [];
      if (recognized) parts.push(`Made ${pluralize(recognized, "page")} searchable.`);
      if (skipped)
        parts.push(
          `${pluralize(skipped, "page")} already had text and ${skipped === 1 ? "was" : "were"} skipped.`,
        );
      useWorkspace
        .getState()
        .setNotice({ kind: "success", message: parts.join(" ") || "Nothing to do." });
    });
  };

  return (
    <PanelSection>
      <Field label="Language of the text">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={inputClass}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
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
      <Checkbox
        checked={skipText}
        onChange={setSkipText}
        label="Skip pages that already have text"
      />
      <Hint>
        Pages look exactly the same; an invisible text layer is added so you can search and copy.
        Recognition runs on your device. The first run downloads the OCR engine and language data
        (about 15 MB), which is then cached.
      </Hint>
      <Hint>
        Accented Latin letters are kept; other scripts can't be added to the text layer yet.
      </Hint>
      <Button
        variant="primary"
        className="w-full"
        disabled={scope === "selected" && selection.length === 0}
        onClick={run}
      >
        <ScanText className="size-4" /> Make searchable
      </Button>
    </PanelSection>
  );
}
