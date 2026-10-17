import type { PaperSize, ResizeOptions } from "@everything-pdf/engine/pure";
import { Scaling } from "lucide-react";
import { useState } from "react";
import { Button, Field, Hint, PanelSection, Segmented, inputClass } from "../../components/ui";
import { applyToDocument } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { defaultResizeOptions } from "../options";

const PAPER_OPTIONS: { value: PaperSize; label: string }[] = [
  { value: "a4", label: "A4 (210 × 297 mm)" },
  { value: "letter", label: "Letter (8.5 × 11 in)" },
  { value: "legal", label: "Legal (8.5 × 14 in)" },
  { value: "a3", label: "A3 (297 × 420 mm)" },
  { value: "a5", label: "A5 (148 × 210 mm)" },
];

export function ResizeFields({
  value,
  onChange,
}: {
  value: ResizeOptions;
  onChange: (value: ResizeOptions) => void;
}) {
  return (
    <>
      <Field label="Paper size">
        <select
          value={value.size}
          onChange={(e) => onChange({ ...value, size: e.target.value as PaperSize })}
          className={inputClass}
        >
          {PAPER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Orientation">
        <Segmented
          label="Orientation"
          value={value.orientation}
          onChange={(orientation) => onChange({ ...value, orientation })}
          options={[
            { value: "auto", label: "Keep" },
            { value: "portrait", label: "Portrait" },
            { value: "landscape", label: "Landscape" },
          ]}
        />
      </Field>
      <Field label="Margin">
        <Segmented
          label="Margin"
          value={String(value.margin)}
          onChange={(m) => onChange({ ...value, margin: Number(m) })}
          options={[
            { value: "0", label: "None" },
            { value: "18", label: "Small" },
            { value: "36", label: "Large" },
          ]}
        />
      </Field>
    </>
  );
}

export function ResizePanel() {
  const [opts, setOpts] = useState(defaultResizeOptions);
  return (
    <PanelSection>
      <ResizeFields value={opts} onChange={setOpts} />
      <Hint>
        Content is scaled to fit and centered, never stretched. Links and form fields on resized
        pages stop working.
      </Hint>
      <Button
        variant="primary"
        className="w-full"
        onClick={() =>
          void applyToDocument(
            "Resizing pages…",
            (bytes) => engine.resizePages(bytes, opts),
            "Pages resized.",
          )
        }
      >
        <Scaling className="size-4" /> Resize pages
      </Button>
    </PanelSection>
  );
}
