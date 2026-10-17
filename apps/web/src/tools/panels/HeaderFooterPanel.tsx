import { expandTemplate, type EdgeText } from "@everything-pdf/engine/pure";
import { PanelTop } from "lucide-react";
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
import { useWorkspace } from "../../store/workspace";
import { defaultHeaderFooterFields, today, type HeaderFooterFieldsValue } from "../options";

function EdgeInputs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EdgeText;
  onChange: (value: EdgeText) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm">{label}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {(["Left", "Center", "Right"] as const).map((side, i) => (
          <input
            key={side}
            aria-label={`${label} ${side.toLowerCase()}`}
            placeholder={side}
            value={value[i]}
            onChange={(e) => {
              const next = [...value] as EdgeText;
              next[i] = e.target.value;
              onChange(next);
            }}
            className={`${inputClass} px-2 text-xs`}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function HeaderFooterFields({
  value,
  onChange,
}: {
  value: HeaderFooterFieldsValue;
  onChange: (value: HeaderFooterFieldsValue) => void;
}) {
  return (
    <>
      <EdgeInputs
        label="Header"
        value={value.header}
        onChange={(header) => onChange({ ...value, header })}
      />
      <EdgeInputs
        label="Footer"
        value={value.footer}
        onChange={(footer) => onChange({ ...value, footer })}
      />
      <Hint>
        Use <code>{"{page}"}</code>, <code>{"{total}"}</code>, <code>{"{file}"}</code> and{" "}
        <code>{"{date}"}</code> to fill in details on each page.
      </Hint>
      <Field label="Size">
        <Segmented
          label="Size"
          value={String(value.fontSize)}
          onChange={(v) => onChange({ ...value, fontSize: Number(v) })}
          options={[
            { value: "8", label: "S" },
            { value: "9", label: "M" },
            { value: "11", label: "L" },
          ]}
        />
      </Field>
      <Checkbox
        checked={value.skipFirst}
        onChange={(skipFirst) => onChange({ ...value, skipFirst })}
        label="Leave the first page (cover) blank"
      />
    </>
  );
}

export function HeaderFooterPanel() {
  const outputName = useWorkspace((s) => s.outputName);
  const pageCount = useWorkspace((s) => s.pages.length);
  const [fields, setFields] = useState(defaultHeaderFooterFields);
  const hasText = [...fields.header, ...fields.footer].some((t) => t.trim());
  const vars = { page: 1, total: pageCount, file: outputName, date: today() };
  const sample = [...fields.footer, ...fields.header].find((t) => t.trim());

  return (
    <PanelSection>
      <HeaderFooterFields value={fields} onChange={setFields} />
      {sample && (
        <p className="text-sm break-words text-ink-2">
          Page 1: <span className="text-ink">{expandTemplate(sample, vars)}</span>
        </p>
      )}
      <Button
        variant="primary"
        className="w-full"
        disabled={!hasText}
        onClick={() =>
          void applyToDocument(
            "Adding header and footer…",
            (bytes) =>
              engine.addHeaderFooter(bytes, { ...fields, fileName: outputName, date: today() }),
            "Header and footer added.",
          )
        }
      >
        <PanelTop className="size-4" /> Add header & footer
      </Button>
    </PanelSection>
  );
}
