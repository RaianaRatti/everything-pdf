import type { FormField, FormFieldValue } from "@everything-pdf/engine";
import { ListChecks, Stamp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Checkbox, Field, Hint, PanelSection, inputClass } from "../../components/ui";
import { applyToDocument, errorMessage, materialize } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { useWorkspace, type PageItem } from "../../store/workspace";

export function FormsPanel() {
  const pages = useWorkspace((s) => s.pages);
  // What was read for which version of the document; re-read whenever it changes (undo too).
  const [read, setRead] = useState<{
    pages: PageItem[];
    fields: FormField[];
    error: string | null;
  } | null>(null);
  const [values, setValues] = useState<Record<string, FormFieldValue>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await engine.readFormFields(await materialize(pages));
      if (cancelled) return;
      setRead({ pages, fields: found, error: null });
      setValues(Object.fromEntries(found.map((f) => [f.name, f.value])));
    })().catch(
      (err: unknown) => !cancelled && setRead({ pages, fields: [], error: errorMessage(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [pages]);

  const current = read?.pages === pages ? read : null;
  const fields = current?.fields ?? null;
  const error = current?.error ?? null;

  const set = (name: string, value: FormFieldValue) => setValues((v) => ({ ...v, [name]: value }));

  const run = (flatten: boolean) =>
    void applyToDocument(
      flatten ? "Filling and flattening…" : "Filling form…",
      (bytes) => engine.fillForm(bytes, values, { flatten }),
      flatten ? "Form filled and flattened. The answers are now part of the page." : "Form filled.",
    );

  if (error)
    return (
      <PanelSection>
        <Hint>{error}</Hint>
      </PanelSection>
    );
  if (!fields)
    return (
      <PanelSection>
        <Hint>Reading form…</Hint>
      </PanelSection>
    );
  if (fields.length === 0) {
    return (
      <PanelSection>
        <Hint>
          This PDF has no fillable fields. To write on it anyway, use the edit page tool to add text
          where you need it.
        </Hint>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title={`${fields.length} fields`}>
        <div className="space-y-3">
          {fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(v) => set(field.name, v)}
            />
          ))}
        </div>
      </PanelSection>
      <PanelSection>
        <Button variant="primary" className="w-full" onClick={() => run(false)}>
          <ListChecks className="size-4" /> Fill form
        </Button>
        <Button className="w-full" onClick={() => run(true)}>
          <Stamp className="size-4" /> Fill & flatten
        </Button>
        <Hint>Flattening locks the answers into the page so they can't be changed.</Hint>
      </PanelSection>
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: FormFieldValue | undefined;
  onChange: (value: FormFieldValue) => void;
}) {
  const label = field.name + (field.readOnly ? " (read-only)" : "");
  switch (field.kind) {
    case "text":
      return (
        <Field label={label}>
          {field.multiline ? (
            <textarea
              rows={3}
              disabled={field.readOnly}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
            />
          ) : (
            <input
              disabled={field.readOnly}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      );
    case "checkbox":
      return <Checkbox checked={value === true} onChange={onChange} label={label} />;
    case "radio":
      return (
        <Field label={label}>
          <select
            disabled={field.readOnly}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      );
    case "choice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <Field label={label}>
          <select
            multiple={field.multiple}
            disabled={field.readOnly}
            value={field.multiple ? selected : (selected[0] ?? "")}
            onChange={(e) =>
              onChange(
                field.multiple
                  ? [...e.target.selectedOptions].map((o) => o.value)
                  : e.target.value
                    ? [e.target.value]
                    : [],
              )
            }
            className={inputClass}
          >
            {!field.multiple && <option value="">—</option>}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
      );
    }
  }
}
