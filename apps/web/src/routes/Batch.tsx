import {
  compressPresets,
  defaultPageNumberOptions,
  defaultWatermarkOptions,
  type PageNumberOptions,
  type ResizeOptions,
  type WatermarkOptions,
} from "@everything-pdf/engine/pure";
import { Download, Plus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Dropzone, FilePickerButton } from "../components/Dropzone";
import { BusyOverlay, NoticeToast, PasswordDialog } from "../components/Overlays";
import {
  Button,
  Checkbox,
  Field,
  Hint,
  PanelSection,
  Segmented,
  inputClass,
} from "../components/ui";
import { errorMessage, loadFiles, runTask } from "../lib/actions";
import { downloadFiles } from "../lib/download";
import { engine } from "../lib/engine";
import { baseName, formatBytes, pluralize, uid } from "../lib/files";
import { closeUnusedPdfs } from "../lib/pdfjs";
import { rasterizePages } from "../lib/raster";
import { useWorkspace, type PageItem, type SourceFile } from "../store/workspace";
import { HeaderFooterFields } from "../tools/panels/HeaderFooterPanel";
import { PageNumberFields } from "../tools/panels/PageNumbersPanel";
import { ResizeFields } from "../tools/panels/ResizePanel";
import { ProtectFields } from "../tools/panels/SecurityPanels";
import { WatermarkFields } from "../tools/panels/WatermarkPanel";
import {
  defaultHeaderFooterFields,
  defaultProtectFields,
  defaultResizeOptions,
  protectProblem,
  toEncryptOptions,
  today,
  type HeaderFooterFieldsValue,
  type ProtectFieldsValue,
} from "../tools/options";

type OperationId =
  | "compress"
  | "page-numbers"
  | "header-footer"
  | "watermark"
  | "rotate"
  | "resize"
  | "grayscale"
  | "remove-metadata"
  | "remove-annotations"
  | "protect";

const OPERATIONS: { id: OperationId; label: string }[] = [
  { id: "compress", label: "Compress" },
  { id: "page-numbers", label: "Add page numbers" },
  { id: "header-footer", label: "Add header & footer" },
  { id: "watermark", label: "Add watermark" },
  { id: "rotate", label: "Rotate all pages" },
  { id: "resize", label: "Change page size" },
  { id: "grayscale", label: "Convert to grayscale" },
  { id: "remove-metadata", label: "Remove metadata" },
  { id: "remove-annotations", label: "Remove comments & annotations" },
  { id: "protect", label: "Password-protect" },
];

interface Settings {
  compress: keyof typeof compressPresets;
  pageNumbers: PageNumberOptions;
  headerFooter: HeaderFooterFieldsValue;
  watermark: WatermarkOptions;
  rotation: number;
  resize: ResizeOptions;
  removeLinks: boolean;
  protect: ProtectFieldsValue;
}

const defaultSettings: Settings = {
  compress: "medium",
  pageNumbers: defaultPageNumberOptions,
  headerFooter: defaultHeaderFooterFields,
  watermark: defaultWatermarkOptions,
  rotation: 90,
  resize: defaultResizeOptions,
  removeLinks: false,
  protect: defaultProtectFields,
};

/** Every page of a file, unrotated: what whole-document operations work on. */
const allPages = (file: SourceFile) =>
  Array.from({ length: file.pageCount }, (_, pageIndex) => ({ source: "f", pageIndex }));

async function runOperation(op: OperationId, file: SourceFile, s: Settings): Promise<Uint8Array> {
  const bytes = file.bytes;
  switch (op) {
    case "compress":
      return (await engine.compress(bytes, compressPresets[s.compress])).bytes;
    case "page-numbers":
      return engine.addPageNumbers(bytes, s.pageNumbers);
    case "header-footer":
      return engine.addHeaderFooter(bytes, {
        ...s.headerFooter,
        fileName: file.name,
        date: today(),
      });
    case "watermark":
      return engine.addWatermark(bytes, s.watermark);
    case "rotate":
      return engine.assemble(
        { f: bytes },
        allPages(file).map((p) => ({ ...p, rotation: s.rotation })),
      );
    case "resize":
      return engine.resizePages(bytes, s.resize);
    case "grayscale": {
      const pages: PageItem[] = Array.from({ length: file.pageCount }, (_, pageIndex) => ({
        id: uid(),
        fileId: file.id,
        pageIndex,
        rotation: 0,
      }));
      const images = await rasterizePages(
        pages,
        { [file.id]: file },
        {
          dpi: 150,
          format: "jpg",
          quality: 0.88,
          grayscale: true,
        },
      );
      return engine.replacePagesWithImages(
        bytes,
        images.map((image, pageIndex) => ({ pageIndex, bytes: image, type: "jpg" })),
      );
    }
    case "remove-metadata":
      return engine.assemble({ f: bytes }, allPages(file), { info: null });
    case "remove-annotations":
      return (await engine.removeAnnotations(bytes, { links: s.removeLinks, forms: false })).bytes;
    case "protect":
      return engine.encrypt(bytes, toEncryptOptions(s.protect));
  }
}

/** Unique names inside the ZIP, in case two inputs share a name. */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${baseName(name)} (${n}).pdf`;
  });
}

export function Batch() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [op, setOp] = useState<OperationId>("compress");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  useEffect(() => {
    document.title = "Batch process · Everything PDF";
  }, []);

  // pdf.js documents opened for grayscale aren't workspace files; close them when leaving.
  useEffect(
    () => () => {
      const ws = useWorkspace.getState();
      closeUnusedPdfs(new Set(ws.pages.map((p) => p.fileId)));
    },
    [],
  );

  const add = async (picked: File[]) => {
    const loaded = await loadFiles(picked);
    setFiles((current) => [...current, ...loaded]);
  };

  const problem =
    op === "protect"
      ? protectProblem(settings.protect)
      : op === "watermark" && !settings.watermark.text.trim()
        ? "Enter watermark text."
        : op === "header-footer" &&
            ![...settings.headerFooter.header, ...settings.headerFooter.footer].some((t) =>
              t.trim(),
            )
          ? "Enter some header or footer text."
          : null;

  const run = () =>
    void runTask("Processing…", async () => {
      const { setBusy, setNotice } = useWorkspace.getState();
      const outputs: { name: string; bytes: Uint8Array }[] = [];
      const failures: string[] = [];
      for (const [i, file] of files.entries()) {
        setBusy(`Processing ${file.name} (${i + 1} of ${files.length})…`);
        try {
          outputs.push({
            name: `${baseName(file.name)}.pdf`,
            bytes: await runOperation(op, file, settings),
          });
        } catch (err) {
          failures.push(`${file.name}: ${errorMessage(err)}`);
        }
      }
      if (outputs.length > 0) {
        const names = uniqueNames(outputs.map((o) => o.name));
        downloadFiles(
          outputs.map((o, i) => ({ name: names[i]!, bytes: o.bytes })),
          `batch-${op}.zip`,
        );
      }
      if (failures.length > 0) {
        setNotice({
          kind: "error",
          message: `${pluralize(failures.length, "file")} couldn't be processed:\n${failures.join("\n")}`,
        });
      } else {
        setNotice({ kind: "success", message: `Done: ${pluralize(outputs.length, "file")}.` });
      }
    });

  let options: ReactNode = null;
  switch (op) {
    case "compress":
      options = (
        <Field label="Level">
          <Segmented
            label="Level"
            value={settings.compress}
            onChange={(v) => set("compress", v)}
            options={[
              { value: "low", label: "Light" },
              { value: "medium", label: "Balanced" },
              { value: "high", label: "Strong" },
            ]}
          />
        </Field>
      );
      break;
    case "page-numbers":
      options = (
        <PageNumberFields value={settings.pageNumbers} onChange={(v) => set("pageNumbers", v)} />
      );
      break;
    case "header-footer":
      options = (
        <HeaderFooterFields
          value={settings.headerFooter}
          onChange={(v) => set("headerFooter", v)}
        />
      );
      break;
    case "watermark":
      options = (
        <WatermarkFields value={settings.watermark} onChange={(v) => set("watermark", v)} />
      );
      break;
    case "rotate":
      options = (
        <Field label="Rotation">
          <Segmented
            label="Rotation"
            value={String(settings.rotation)}
            onChange={(v) => set("rotation", Number(v))}
            options={[
              { value: "270", label: "90° left" },
              { value: "180", label: "180°" },
              { value: "90", label: "90° right" },
            ]}
          />
        </Field>
      );
      break;
    case "resize":
      options = <ResizeFields value={settings.resize} onChange={(v) => set("resize", v)} />;
      break;
    case "grayscale":
      options = (
        <Hint>Pages are stored as images afterwards, so their text can't be selected.</Hint>
      );
      break;
    case "remove-metadata":
      options = (
        <Hint>Removes title, author, dates, software details and hidden XMP metadata.</Hint>
      );
      break;
    case "remove-annotations":
      options = (
        <Checkbox
          checked={settings.removeLinks}
          onChange={(v) => set("removeLinks", v)}
          label="Also remove links"
        />
      );
      break;
    case "protect":
      options = <ProtectFields value={settings.protect} onChange={(v) => set("protect", v)} />;
      break;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b-2 border-ink p-2">
        <Link
          to="/"
          aria-label="All tools"
          className="border-2 border-transparent px-3 py-1.5 hover:border-ink"
        >
          ←
        </Link>
        <h1 className="text-lg">batch process</h1>
      </header>

      {files.length === 0 ? (
        <main className="flex-1 p-4 sm:p-8">
          <div className="mx-auto max-w-2xl pt-4 sm:pt-16">
            <Dropzone
              onFiles={(f) => void add(f)}
              accept="application/pdf,.pdf"
              title="drop PDFs here"
              subtitle="Pick a tool, and it runs on every file. You get them all back in one ZIP."
            />
          </div>
        </main>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row">
          <main className="flex-1 p-4 sm:p-6">
            <ul className="space-y-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 border-2 border-ink bg-card p-2 pl-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{f.name}</p>
                    <p className="text-xs text-ink-3">
                      {pluralize(f.pageCount, "page")} · {formatBytes(f.bytes.length)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="px-1.5"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <FilePickerButton
              onFiles={(f) => void add(f)}
              accept="application/pdf,.pdf"
              className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-dashed border-ink py-2.5 text-sm hover:bg-paper-3"
            >
              <Plus className="size-4" /> Add more PDFs
            </FilePickerButton>
          </main>
          <aside className="shrink-0 border-t-2 border-ink lg:w-80 lg:border-t-0 lg:border-l-2">
            <PanelSection>
              <Field label="Tool">
                <select
                  value={op}
                  onChange={(e) => setOp(e.target.value as OperationId)}
                  className={inputClass}
                >
                  {OPERATIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              {options}
              <Button
                variant="primary"
                className="w-full"
                disabled={problem !== null}
                onClick={run}
              >
                <Download className="size-4" /> Run on {pluralize(files.length, "file")}
              </Button>
              {problem && <p className="text-sm text-ink-2">{problem}</p>}
            </PanelSection>
          </aside>
        </div>
      )}
      <BusyOverlay />
      <PasswordDialog />
      <NoticeToast />
    </div>
  );
}
