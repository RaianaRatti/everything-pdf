import {
  compressPresets,
  defaultPageNumberOptions,
  defaultWatermarkOptions,
  type PageNumberOptions,
  type ResizeOptions,
  type WatermarkOptions,
} from "@everything-pdf/engine/pure";
import { BookmarkPlus, ChevronDown, ChevronUp, Download, Plus, Trash, X } from "lucide-react";
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
import { findTool } from "../tools/registry";

type OperationId =
  | "compress"
  | "page-numbers"
  | "header-footer"
  | "watermark"
  | "rotate"
  | "resize"
  | "grayscale"
  | "dark-mode"
  | "remove-metadata"
  | "remove-annotations"
  | "fast-web-view"
  | "protect";

const OPERATIONS: { id: OperationId; label: string }[] = [
  { id: "compress", label: "Compress" },
  { id: "page-numbers", label: "Add page numbers" },
  { id: "header-footer", label: "Add header & footer" },
  { id: "watermark", label: "Add watermark" },
  { id: "rotate", label: "Rotate all pages" },
  { id: "resize", label: "Change page size" },
  { id: "grayscale", label: "Convert to grayscale" },
  { id: "dark-mode", label: "Dark mode (keeps text)" },
  { id: "remove-metadata", label: "Remove metadata" },
  { id: "remove-annotations", label: "Remove comments & annotations" },
  { id: "fast-web-view", label: "Optimize for fast web view" },
  { id: "protect", label: "Password-protect" },
];

/** These change the file in a way later steps would undo (or can't read), so they go last. */
const MUST_BE_LAST: OperationId[] = ["protect", "fast-web-view"];

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

interface Step {
  id: string;
  op: OperationId;
  settings: Settings;
}

const newStep = (op: OperationId = "compress"): Step => ({
  id: uid(),
  op,
  settings: defaultSettings,
});

// ---------------------------------------------------------------------------------------------
// Saved recipes (this browser only). Passwords are never saved.

interface Recipe {
  name: string;
  steps: { op: OperationId; settings: Settings }[];
}

const RECIPES_KEY = "everything-pdf:recipes";

function loadRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Recipe[]) : [];
  } catch {
    return [];
  }
}

function storeRecipes(recipes: Recipe[]): boolean {
  try {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
    return true;
  } catch {
    return false;
  }
}

function withoutPasswords(settings: Settings): Settings {
  return {
    ...settings,
    protect: { ...settings.protect, userPassword: "", confirm: "", ownerPassword: "" },
  };
}

// ---------------------------------------------------------------------------------------------
// Running

async function runStep(step: Step, bytes: Uint8Array, name: string): Promise<Uint8Array> {
  const s = step.settings;
  const allPages = async () => {
    const { pageCount } = await engine.inspect(bytes);
    return Array.from({ length: pageCount }, (_, pageIndex) => ({ source: "f", pageIndex }));
  };
  switch (step.op) {
    case "compress":
      return (await engine.compress(bytes, compressPresets[s.compress])).bytes;
    case "page-numbers":
      return engine.addPageNumbers(bytes, s.pageNumbers);
    case "header-footer":
      return engine.addHeaderFooter(bytes, { ...s.headerFooter, fileName: name, date: today() });
    case "watermark":
      return engine.addWatermark(bytes, s.watermark);
    case "rotate":
      return engine.assemble(
        { f: bytes },
        (await allPages()).map((p) => ({ ...p, rotation: s.rotation })),
      );
    case "resize":
      return engine.resizePages(bytes, s.resize);
    case "grayscale": {
      // A throwaway source id, so pdf.js never mixes up versions between steps.
      const file: SourceFile = { id: uid(), name, bytes, pageCount: (await allPages()).length };
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
    case "dark-mode":
      return engine.recolor(bytes, { mode: "smart", keepImages: true });
    case "remove-metadata":
      return engine.assemble({ f: bytes }, await allPages(), { info: null });
    case "remove-annotations":
      return (await engine.removeAnnotations(bytes, { links: s.removeLinks, forms: false })).bytes;
    case "fast-web-view":
      return engine.linearize(bytes);
    case "protect":
      return engine.encrypt(bytes, toEncryptOptions(s.protect));
  }
}

/** Why a step can't run yet, or null. */
function stepProblem(step: Step, index: number, count: number): string | null {
  const s = step.settings;
  if (MUST_BE_LAST.includes(step.op) && index !== count - 1) {
    return `“${OPERATIONS.find((o) => o.id === step.op)!.label}” has to be the last step.`;
  }
  switch (step.op) {
    case "protect":
      return protectProblem(s.protect);
    case "watermark":
      return s.watermark.text.trim() ? null : "Enter watermark text.";
    case "header-footer":
      return [...s.headerFooter.header, ...s.headerFooter.footer].some((t) => t.trim())
        ? null
        : "Enter some header or footer text.";
    default:
      return null;
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

// ---------------------------------------------------------------------------------------------
// Page

export function Batch() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes);
  const [recipeName, setRecipeName] = useState("");

  useEffect(() => {
    document.title = "Batch process · everything-pdf";
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

  const updateStep = (id: string, patch: Partial<Step>) =>
    setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveStep = (index: number, delta: number) =>
    setSteps((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const problem = steps.map((s, i) => stepProblem(s, i, steps.length)).find((p) => p) ?? null;

  const run = () =>
    void runTask("Processing…", async () => {
      const { setBusy, setNotice } = useWorkspace.getState();
      const outputs: { name: string; bytes: Uint8Array }[] = [];
      const failures: string[] = [];
      for (const [i, file] of files.entries()) {
        try {
          let bytes = file.bytes;
          for (const [k, step] of steps.entries()) {
            setBusy(
              `${file.name} (${i + 1} of ${files.length})` +
                (steps.length > 1 ? `: step ${k + 1} of ${steps.length}…` : "…"),
            );
            bytes = await runStep(step, bytes, file.name);
          }
          outputs.push({ name: `${baseName(file.name)}.pdf`, bytes });
        } catch (err) {
          failures.push(`${file.name}: ${errorMessage(err)}`);
        }
      }
      if (outputs.length > 0) {
        const names = uniqueNames(outputs.map((o) => o.name));
        downloadFiles(
          outputs.map((o, i) => ({ name: names[i]!, bytes: o.bytes })),
          steps.length === 1 ? `batch-${steps[0]!.op}.zip` : "batch.zip",
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

  const saveRecipe = () => {
    const name = recipeName.trim();
    if (!name) return;
    const recipe: Recipe = {
      name,
      steps: steps.map((s) => ({ op: s.op, settings: withoutPasswords(s.settings) })),
    };
    const next = [...recipes.filter((r) => r.name !== name), recipe];
    const ok = storeRecipes(next);
    setRecipes(next);
    setRecipeName("");
    useWorkspace
      .getState()
      .setNotice(
        ok
          ? { kind: "success", message: `Saved “${name}” in this browser.` }
          : { kind: "error", message: "Couldn't save: this browser blocks storage here." },
      );
  };

  const applyRecipe = (name: string) => {
    const recipe = recipes.find((r) => r.name === name);
    if (!recipe) return;
    // Fill in defaults for settings added since the recipe was saved.
    setSteps(
      recipe.steps.map((s) => ({
        id: uid(),
        op: s.op,
        settings: { ...defaultSettings, ...s.settings },
      })),
    );
  };

  const deleteRecipe = (name: string) => {
    const next = recipes.filter((r) => r.name !== name);
    storeRecipes(next);
    setRecipes(next);
  };

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
              subtitle={findTool("batch")?.description}
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
          <aside className="shrink-0 border-t-2 border-ink lg:w-96 lg:border-t-0 lg:border-l-2">
            {recipes.length > 0 && (
              <PanelSection title="Saved recipes">
                <ul className="space-y-1.5">
                  {recipes.map((r) => (
                    <li key={r.name} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => applyRecipe(r.name)}
                        className="min-w-0 flex-1 truncate border-2 border-ink px-2 py-1 text-left text-sm hover:bg-ink hover:text-paper"
                      >
                        {r.name}
                        <span className="ml-2 text-xs opacity-70">
                          {pluralize(r.steps.length, "step")}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        className="px-1.5"
                        aria-label={`Delete ${r.name}`}
                        onClick={() => deleteRecipe(r.name)}
                      >
                        <Trash className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </PanelSection>
            )}

            {steps.map((step, i) => (
              <PanelSection key={step.id}>
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-sm text-ink-2">{i + 1}.</span>
                  <select
                    aria-label={`Step ${i + 1}`}
                    value={step.op}
                    onChange={(e) => updateStep(step.id, { op: e.target.value as OperationId })}
                    className={`${inputClass} flex-1`}
                  >
                    {OPERATIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    className="px-1"
                    aria-label="Move step up"
                    disabled={i === 0}
                    onClick={() => moveStep(i, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-1"
                    aria-label="Move step down"
                    disabled={i === steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-1"
                    aria-label="Remove step"
                    disabled={steps.length === 1}
                    onClick={() => setSteps((list) => list.filter((s) => s.id !== step.id))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <StepOptions
                  step={step}
                  onChange={(settings) => updateStep(step.id, { settings })}
                />
              </PanelSection>
            ))}

            <PanelSection>
              <Button
                className="w-full"
                onClick={() => setSteps((list) => [...list, newStep("page-numbers")])}
              >
                <Plus className="size-4" /> Add a step
              </Button>
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

            <PanelSection title="Save these steps as a recipe">
              <div className="flex gap-2">
                <input
                  aria-label="Recipe name"
                  placeholder="e.g. Send to client"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveRecipe()}
                  className={`${inputClass} flex-1`}
                />
                <Button disabled={!recipeName.trim()} onClick={saveRecipe}>
                  <BookmarkPlus className="size-4" /> Save
                </Button>
              </div>
              <Hint>Recipes are kept in this browser only. Passwords are never saved.</Hint>
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

function StepOptions({ step, onChange }: { step: Step; onChange: (s: Settings) => void }) {
  const s = step.settings;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...s, [key]: value });
  let options: ReactNode = null;
  switch (step.op) {
    case "compress":
      options = (
        <Field label="Level">
          <Segmented
            label="Level"
            value={s.compress}
            onChange={(v) => set("compress", v)}
            options={[
              { value: "lossless", label: "Lossless" },
              { value: "low", label: "Light" },
              { value: "medium", label: "Balanced" },
              { value: "high", label: "Strong" },
            ]}
          />
        </Field>
      );
      break;
    case "page-numbers":
      options = <PageNumberFields value={s.pageNumbers} onChange={(v) => set("pageNumbers", v)} />;
      break;
    case "header-footer":
      options = (
        <HeaderFooterFields value={s.headerFooter} onChange={(v) => set("headerFooter", v)} />
      );
      break;
    case "watermark":
      options = <WatermarkFields value={s.watermark} onChange={(v) => set("watermark", v)} />;
      break;
    case "rotate":
      options = (
        <Field label="Rotation">
          <Segmented
            label="Rotation"
            value={String(s.rotation)}
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
      options = <ResizeFields value={s.resize} onChange={(v) => set("resize", v)} />;
      break;
    case "grayscale":
      options = (
        <Hint>Pages are stored as images afterwards, so their text can't be selected.</Hint>
      );
      break;
    case "dark-mode":
      options = <Hint>Light pages turn dark, text stays selectable, photos are left alone.</Hint>;
      break;
    case "remove-metadata":
      options = (
        <Hint>Removes title, author, dates, software details and hidden XMP metadata.</Hint>
      );
      break;
    case "remove-annotations":
      options = (
        <Checkbox
          checked={s.removeLinks}
          onChange={(v) => set("removeLinks", v)}
          label="Also remove links"
        />
      );
      break;
    case "fast-web-view":
      options = <Hint>Lets browsers show the first page while the rest is still loading.</Hint>;
      break;
    case "protect":
      options = <ProtectFields value={s.protect} onChange={(v) => set("protect", v)} />;
      break;
  }
  return <>{options}</>;
}
