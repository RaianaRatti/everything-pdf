import type { PdfDetails } from "@everything-pdf/engine";
import { PAPER_SIZES, emptyDocInfo, type DocInfo } from "@everything-pdf/engine/pure";
import { Download, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Checkbox, Field, Hint, PanelSection, inputClass } from "../../components/ui";
import { downloadDocument, errorMessage } from "../../lib/actions";
import { engine } from "../../lib/engine";
import { formatBytes, pluralize } from "../../lib/files";
import { useWorkspace } from "../../store/workspace";

/** "A4 portrait", "Letter landscape" or "200 × 300 mm". */
function describeSize(width: number, height: number): string {
  for (const [name, [w, h]] of Object.entries(PAPER_SIZES)) {
    const close = (a: number, b: number) => Math.abs(a - b) < 3;
    const label = name.length === 2 ? name.toUpperCase() : name[0]!.toUpperCase() + name.slice(1);
    if (close(width, w) && close(height, h)) return `${label} portrait`;
    if (close(width, h) && close(height, w)) return `${label} landscape`;
  }
  const mm = (pt: number) => Math.round((pt / 72) * 25.4);
  return `${mm(width)} × ${mm(height)} mm`;
}

export function PropertiesPanel() {
  const pages = useWorkspace((s) => s.pages);
  const files = useWorkspace((s) => s.files);
  const docInfo = useWorkspace((s) => s.docInfo);
  const setDocInfo = useWorkspace((s) => s.setDocInfo);
  const inUse = [...new Set(pages.map((p) => p.fileId))];
  const [fileId, setFileId] = useState(inUse[0]);
  const current = fileId && inUse.includes(fileId) ? fileId : inUse[0];
  const file = current ? files[current] : undefined;
  const [details, setDetails] = useState<{ fileId: string; data: PdfDetails } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    engine
      .inspectDetails(file.bytes)
      .then((data) => !cancelled && setDetails({ fileId: file.id, data }))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [file]);

  const info = docInfo ?? emptyDocInfo;
  const update = (patch: Partial<DocInfo>) => setDocInfo({ ...info, ...patch });
  const d = details?.fileId === file?.id ? details?.data : undefined;
  const dropped = d && (d.attachments > 0 || d.hasJavaScript);

  return (
    <>
      <PanelSection title="Saved with your download">
        <Checkbox
          checked={docInfo === null}
          onChange={(strip) => setDocInfo(strip ? null : emptyDocInfo)}
          label="Remove all metadata"
        />
        {docInfo === null ? (
          <Hint>
            Downloads will have no title, author, dates or software details, and hidden XMP metadata
            on pages and images is stripped too.
          </Hint>
        ) : (
          (["title", "author", "subject", "keywords"] as const).map((key) => (
            <Field key={key} label={key[0]!.toUpperCase() + key.slice(1)}>
              <input
                value={info[key]}
                placeholder={key === "keywords" ? "Separated by commas" : undefined}
                onChange={(e) => update({ [key]: e.target.value })}
                className={inputClass}
              />
            </Field>
          ))
        )}
        <Button variant="primary" className="w-full" onClick={() => void downloadDocument()}>
          <Download className="size-4" /> Download
        </Button>
      </PanelSection>

      <PanelSection title="What's inside">
        {inUse.length > 1 && (
          <select
            aria-label="File to inspect"
            value={current}
            onChange={(e) => setFileId(e.target.value)}
            className={inputClass}
          >
            {inUse.map((id) => (
              <option key={id} value={id}>
                {files[id]?.name}
              </option>
            ))}
          </select>
        )}
        {error && <Hint>{error}</Hint>}
        {!d && !error && <Hint>Reading…</Hint>}
        {d && file && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Row label="Size">{formatBytes(file.bytes.length)}</Row>
            <Row label="Pages">{d.pageCount}</Row>
            <Row label="Page size">
              {d.pageSizes
                .slice(0, 3)
                .map(
                  (s) =>
                    describeSize(s.width, s.height) +
                    (d.pageSizes.length > 1 ? ` (${s.count})` : ""),
                )
                .join(", ")}
              {d.pageSizes.length > 3 && ", …"}
            </Row>
            <Row label="PDF version">{d.version}</Row>
            {d.info.title && <Row label="Title">{d.info.title}</Row>}
            {d.info.author && <Row label="Author">{d.info.author}</Row>}
            {d.info.creator && <Row label="Made with">{d.info.creator}</Row>}
            {d.info.producer && <Row label="Producer">{d.info.producer}</Row>}
            {d.info.created && (
              <Row label="Created">{new Date(d.info.created).toLocaleString()}</Row>
            )}
            {d.info.modified && (
              <Row label="Modified">{new Date(d.info.modified).toLocaleString()}</Row>
            )}
            <Row label="Hidden metadata">{d.hasMetadata ? "Yes (XMP)" : "None"}</Row>
            <Row label="Fonts">{d.fonts.length ? d.fonts.join(", ") : "None"}</Row>
            <Row label="Images">{d.imageCount}</Row>
            <Row label="Form fields">{d.formFields}</Row>
            <Row label="Annotations">
              {Object.entries(d.annotations)
                .map(([type, n]) => `${n} ${type.toLowerCase()}`)
                .join(", ") || "None"}
            </Row>
            <Row label="Attachments">{d.attachments}</Row>
            <Row label="JavaScript">{d.hasJavaScript ? "Yes" : "No"}</Row>
          </dl>
        )}
        {dropped && (
          <p className="flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Attachments and document scripts aren't carried into downloads from here.
          </p>
        )}
        {d && (
          <Hint>{pluralize(d.pageCount, "page")} in the original file, before your changes.</Hint>
        )}
      </PanelSection>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
