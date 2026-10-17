import {
  defaultPageNumberOptions,
  formatPageNumber,
  type NumberFormat,
  type NumberPosition,
  type PageNumberOptions,
} from "@everything-pdf/engine/pure";
import { Hash } from "lucide-react";
import { useState } from "react";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { useWorkspace } from "../../store/workspace";
import { Button, Checkbox, Field, PanelSection, Segmented, inputClass } from "../../components/ui";

const POSITIONS: NumberPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const FORMATS: { value: NumberFormat; label: string }[] = [
  { value: "n", label: "1" },
  { value: "page-n", label: "Page 1" },
  { value: "n-of-total", label: "1 of 10" },
  { value: "page-n-of-total", label: "Page 1 of 10" },
];

export function PageNumberFields({
  value: opts,
  onChange,
}: {
  value: PageNumberOptions;
  onChange: (value: PageNumberOptions) => void;
}) {
  const update = (patch: Partial<PageNumberOptions>) => onChange({ ...opts, ...patch });
  return (
    <>
      <Field label="Position">
        <div
          role="radiogroup"
          aria-label="Position"
          className="mx-auto grid aspect-[3/4] w-32 grid-cols-3 grid-rows-[auto_1fr_auto] gap-1 border-2 border-ink bg-card p-2"
        >
          {POSITIONS.map((pos, i) => (
            <button
              key={pos}
              type="button"
              role="radio"
              aria-checked={opts.position === pos}
              aria-label={pos.replace("-", " ")}
              onClick={() => update({ position: pos })}
              className={`h-6 ${i >= 3 ? "row-start-3" : ""} ${
                opts.position === pos ? "bg-ink" : "bg-paper-3 hover:bg-line-strong"
              }`}
            />
          ))}
        </div>
      </Field>
      <Field label="Format">
        <select
          value={opts.format}
          onChange={(e) => update({ format: e.target.value as NumberFormat })}
          className={inputClass}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start at">
          <input
            type="number"
            min={0}
            value={opts.startAt}
            onChange={(e) =>
              update({ startAt: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Size">
          <Segmented
            label="Size"
            value={String(opts.fontSize)}
            onChange={(v) => update({ fontSize: Number(v) })}
            options={[
              { value: "9", label: "S" },
              { value: "11", label: "M" },
              { value: "14", label: "L" },
            ]}
          />
        </Field>
      </div>
      <Checkbox
        checked={opts.skipFirst}
        onChange={(skipFirst) => update({ skipFirst })}
        label="Don't number the first page (cover)"
      />
    </>
  );
}

export function PageNumbersPanel() {
  const pageCount = useWorkspace((s) => s.pages.length);
  const [opts, setOpts] = useState<PageNumberOptions>(defaultPageNumberOptions);

  const numbered = Math.max(0, pageCount - (opts.skipFirst ? 1 : 0));
  const preview = formatPageNumber(opts.format, opts.startAt, opts.startAt + numbered - 1);

  return (
    <>
      <PanelSection>
        <PageNumberFields value={opts} onChange={setOpts} />
      </PanelSection>
      <PanelSection>
        <p className="text-sm text-ink-2">
          First number: <span className="text-ink">{preview}</span>
        </p>
        <Button
          variant="primary"
          className="w-full"
          disabled={numbered === 0}
          onClick={() =>
            void applyToDocument(
              "Adding page numbers…",
              (bytes) => engine.addPageNumbers(bytes, opts),
              "Page numbers added.",
            )
          }
        >
          <Hash className="size-4" /> Add page numbers
        </Button>
      </PanelSection>
    </>
  );
}
