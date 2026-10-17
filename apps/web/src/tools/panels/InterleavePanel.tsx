import { Columns2 } from "lucide-react";
import { useState } from "react";
import { FilePickerButton } from "../../components/Dropzone";
import { Button, Checkbox, Field, Hint, PanelSection, inputClass } from "../../components/ui";
import { addFiles } from "../../lib/actions";
import { pluralize } from "../../lib/files";
import { useWorkspace, type PageItem } from "../../store/workspace";

/** Alternates a, b, a, b…; whatever is left over from the longer list goes at the end. */
function alternate(a: PageItem[], b: PageItem[]): PageItem[] {
  const out: PageItem[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return out;
}

export function InterleavePanel() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const setPages = useWorkspace((s) => s.setPages);
  const order = [...new Set(pages.map((p) => p.fileId))];
  const [front, setFront] = useState<string | undefined>();
  const [back, setBack] = useState<string | undefined>();
  const [reverseBack, setReverseBack] = useState(true);

  const frontId = front && order.includes(front) ? front : order[0];
  const backId =
    back && order.includes(back) && back !== frontId ? back : order.find((id) => id !== frontId);
  const count = (id: string | undefined) => pages.filter((p) => p.fileId === id).length;

  const interleaveFiles = () => {
    const a = pages.filter((p) => p.fileId === frontId);
    let b = pages.filter((p) => p.fileId === backId);
    if (reverseBack) b = [...b].reverse();
    const rest = pages.filter((p) => p.fileId !== frontId && p.fileId !== backId);
    setPages([...alternate(a, b), ...rest]);
  };

  const interleaveHalves = () => {
    const half = Math.ceil(pages.length / 2);
    let b = pages.slice(half);
    if (reverseBack) b = [...b].reverse();
    setPages(alternate(pages.slice(0, half), b));
  };

  const fileSelect = (label: string, value: string | undefined, onChange: (id: string) => void) => (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {order.map((id) => (
          <option key={id} value={id}>
            {files[id]?.name} ({pluralize(count(id), "page")})
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <>
      {order.length >= 2 ? (
        <PanelSection title="Two files">
          {fileSelect("Fronts (pages 1, 3, 5…)", frontId, setFront)}
          {fileSelect("Backs (pages 2, 4, 6…)", backId, setBack)}
          <Checkbox
            checked={reverseBack}
            onChange={setReverseBack}
            label="Backs were scanned in reverse order"
          />
          <Button variant="primary" className="w-full" onClick={interleaveFiles}>
            <Columns2 className="size-4" /> Interleave
          </Button>
        </PanelSection>
      ) : (
        <PanelSection title="Two files">
          <Hint>
            Add the second file (e.g. the back sides of a double-sided scan) to alternate pages
            between them.
          </Hint>
          <FilePickerButton
            onFiles={(f) => void addFiles(f)}
            accept="application/pdf,.pdf,image/*"
            className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-ink py-2.5 text-sm hover:bg-paper-3"
          >
            Add second file…
          </FilePickerButton>
        </PanelSection>
      )}
      <PanelSection title="One file">
        <Hint>
          If the fronts and backs are in one file (all fronts first, then all backs), interleave its
          two halves.
        </Hint>
        <Checkbox
          checked={reverseBack}
          onChange={setReverseBack}
          label="Backs are in reverse order"
        />
        <Button className="w-full" disabled={pages.length < 2} onClick={interleaveHalves}>
          Interleave halves
        </Button>
      </PanelSection>
    </>
  );
}
