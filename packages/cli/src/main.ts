import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  REDACTION_PATTERNS,
  addPageNumbers,
  addWatermark,
  assemble,
  booklet,
  compress,
  compressPresets,
  decryptPdf,
  encryptPdf,
  extractImages,
  findMatches,
  keepOutside,
  linearizePdf,
  literalPattern,
  nUp,
  poster,
  readOutline,
  recolorPdf,
  redactPages,
  repairPdf,
  signPdfDigitally,
  splitSpreads,
  verifySignatures,
  type NUpOptions,
  type PaperSize,
  type RedactionPattern,
  extractGroups,
  imagesToPdf,
  loadPdf,
  merge,
  parsePageRanges,
  planSplit,
  replacePagesWithImages,
  stampImage,
  type NumberFormat,
  type NumberPosition,
  type PageRef,
  type SplitMode,
} from "@everything-pdf/engine";
import { nodeCodec, prepareImage } from "./images";
import { renderPages, textRunsOf } from "./render";

export interface Io {
  out(line: string): void;
  err(line: string): void;
  /** Transient progress for long jobs; may be a no-op. */
  progress(line: string): void;
  cwd: string;
}

/** A mistake in how the command was called (exit code 2), as opposed to a failure doing it. */
class UsageError extends Error {}

type Values = Record<string, string | boolean | undefined>;

interface Command {
  name: string;
  summary: string;
  usage: string;
  options: NonNullable<ParseArgsConfig["options"]>;
  run(positionals: string[], values: Values, io: Io): Promise<void>;
}

const output = { output: { type: "string", short: "o" } } as const;
const pages = { pages: { type: "string", short: "p" } } as const;

// ---------------------------------------------------------------------------------------------
// Helpers

function str(values: Values, key: string): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

function number(
  values: Values,
  key: string,
  fallback: number,
  { min = -Infinity, max = Infinity, integer = false } = {},
): number {
  const raw = str(values, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    const kind = integer ? "a whole number" : "a number";
    const range = Number.isFinite(min) && Number.isFinite(max) ? ` from ${min} to ${max}` : "";
    throw new UsageError(`--${key} must be ${kind}${range}, got "${raw}".`);
  }
  return n;
}

/** A position on the page: a fraction ("0.6") or a percentage ("60%"). */
function fraction(values: Values, key: string, fallback: number): number {
  const raw = str(values, key);
  if (raw === undefined) return fallback;
  const n = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new UsageError(`--${key} must be between 0 and 1 (or 0% and 100%), got "${raw}".`);
  }
  return n;
}

function choice<T extends string>(
  values: Values,
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  const raw = str(values, key) ?? fallback;
  if (!(options as readonly string[]).includes(raw)) {
    throw new UsageError(`--${key} must be one of: ${options.join(", ")}. Got "${raw}".`);
  }
  return raw as T;
}

function onlyInput(positionals: string[], what = "a PDF"): string {
  if (positionals.length !== 1) throw new UsageError(`Give exactly one input: ${what}.`);
  return positionals[0]!;
}

async function read(io: Io, path: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(resolve(io.cwd, path)));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(
      code === "ENOENT" ? `${path}: no such file.` : `${path}: can't read it (${code}).`,
      { cause: err },
    );
  }
}

function stem(path: string): string {
  return basename(path, extname(path));
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Writes a file, refusing to clobber any of the command's own inputs. */
async function write(io: Io, path: string, bytes: Uint8Array, inputs: string[]): Promise<string> {
  const target = resolve(io.cwd, path);
  if (inputs.some((input) => resolve(io.cwd, input) === target)) {
    throw new UsageError(`Refusing to overwrite the input file ${path}. Pick another --output.`);
  }
  await writeFile(target, bytes);
  return path;
}

async function writePdf(io: Io, path: string, bytes: Uint8Array, inputs: string[]): Promise<void> {
  await write(io, path, bytes, inputs);
  const pageCount = (await loadPdf(bytes)).getPageCount();
  io.out(`wrote ${path} (${plural(pageCount, "page")}, ${formatSize(bytes.length)})`);
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  return (await loadPdf(bytes)).getPageCount();
}

/** Resolves --pages to 0-based indices, defaulting to every page. */
function selectPages(values: Values, pageCount: number): number[] {
  const spec = str(values, "pages");
  if (!spec) return Array.from({ length: pageCount }, (_, i) => i);
  return [...new Set(parsePageRanges(spec, pageCount).flat())];
}

function requirePages(values: Values, pageCount: number, verb: string): number[] {
  const spec = str(values, "pages");
  if (!spec) throw new UsageError(`Say which pages to ${verb} with --pages, e.g. --pages 1-3,7.`);
  return parsePageRanges(spec, pageCount).flat();
}

function paper(values: Values): PaperSize {
  return choice(values, "paper", ["a4", "letter", "a3", "a5", "legal"] as const, "a4");
}

function rangeLabel(pages: number[]): string {
  const first = pages[0]! + 1;
  const last = pages.at(-1)! + 1;
  return pages.length === 1 ? `page-${first}` : `pages-${first}-${last}`;
}

// ---------------------------------------------------------------------------------------------
// Commands

const commands: Command[] = [
  {
    name: "merge",
    summary: "Combine PDFs into one, in the order given",
    usage: "merge <a.pdf> <b.pdf> [more.pdf…] [-o merged.pdf]",
    options: { ...output },
    async run(inputs, values, io) {
      if (inputs.length < 2) throw new UsageError("Give at least two PDFs to merge.");
      const files = await Promise.all(inputs.map((f) => read(io, f)));
      await writePdf(io, str(values, "output") ?? "merged.pdf", await merge(files), inputs);
    },
  },
  {
    name: "split",
    summary: "Split into several PDFs: every N pages, single pages, or custom ranges",
    usage: "split <in.pdf> [--every 2 | --single | --ranges 1-3,4-8,9-] [-o out-dir]",
    options: {
      ...output,
      every: { type: "string" },
      single: { type: "boolean" },
      ranges: { type: "string" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const chosen = ["every", "single", "ranges"].filter((k) => values[k] !== undefined);
      if (chosen.length > 1) throw new UsageError("Use only one of --every, --single, --ranges.");
      const mode: SplitMode = values.single
        ? { kind: "single" }
        : str(values, "ranges")
          ? { kind: "ranges", ranges: str(values, "ranges")! }
          : { kind: "every", pages: number(values, "every", 1, { min: 1, integer: true }) };

      const bytes = await read(io, input);
      const parts = await extractGroups(bytes, planSplit(mode, await pageCountOf(bytes)));
      const dir = str(values, "output") ?? `${stem(input)}-split`;
      await mkdir(resolve(io.cwd, dir), { recursive: true });
      for (const part of parts) {
        const path = join(dir, `${stem(input)}-${rangeLabel(part.pages)}.pdf`);
        await write(io, path, part.bytes, [input]);
      }
      io.out(`wrote ${plural(parts.length, "file")} to ${dir}/`);
    },
  },
  {
    name: "extract",
    summary: "Make a new PDF from some pages, in the order listed",
    usage: "extract <in.pdf> --pages 1-3,7 [-o out.pdf]",
    options: { ...output, ...pages },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const bytes = await read(io, input);
      const chosen = requirePages(values, await pageCountOf(bytes), "extract");
      const out = await assemble(
        { input: bytes },
        chosen.map((pageIndex) => ({ source: "input", pageIndex })),
      );
      await writePdf(io, str(values, "output") ?? `${stem(input)}-extracted.pdf`, out, [input]);
    },
  },
  {
    name: "delete",
    summary: "Remove pages",
    usage: "delete <in.pdf> --pages 2,5-6 [-o out.pdf]",
    options: { ...output, ...pages },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const bytes = await read(io, input);
      const count = await pageCountOf(bytes);
      const remove = new Set(requirePages(values, count, "delete"));
      const keep = Array.from({ length: count }, (_, i) => i).filter((i) => !remove.has(i));
      if (keep.length === 0) throw new UsageError("That would delete every page.");
      const out = await assemble(
        { input: bytes },
        keep.map((pageIndex) => ({ source: "input", pageIndex })),
      );
      await writePdf(io, str(values, "output") ?? `${stem(input)}-trimmed.pdf`, out, [input]);
    },
  },
  {
    name: "reorder",
    summary: "Put pages in a new order (pages can repeat; unlisted pages are dropped)",
    usage: "reorder <in.pdf> --order 3,1-2,4- [-o out.pdf]",
    options: { ...output, order: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const order = str(values, "order");
      if (!order) throw new UsageError("Give the new page order with --order, e.g. --order 3,1,2.");
      const bytes = await read(io, input);
      const indices = parsePageRanges(order, await pageCountOf(bytes)).flat();
      const out = await assemble(
        { input: bytes },
        indices.map((pageIndex) => ({ source: "input", pageIndex })),
      );
      await writePdf(io, str(values, "output") ?? `${stem(input)}-reordered.pdf`, out, [input]);
    },
  },
  {
    name: "rotate",
    summary: "Rotate pages clockwise (all pages unless --pages is given)",
    usage: "rotate <in.pdf> [--angle 90|180|270|-90] [--pages 1,3] [-o out.pdf]",
    options: { ...output, ...pages, angle: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const angle = number(values, "angle", 90, { integer: true });
      if (angle % 90 !== 0) throw new UsageError("--angle must be a multiple of 90.");
      const bytes = await read(io, input);
      const count = await pageCountOf(bytes);
      const targets = new Set(selectPages(values, count));
      const refs: PageRef[] = Array.from({ length: count }, (_, pageIndex) => ({
        source: "input",
        pageIndex,
        rotation: targets.has(pageIndex) ? angle : 0,
      }));
      const out = await assemble({ input: bytes }, refs);
      await writePdf(io, str(values, "output") ?? `${stem(input)}-rotated.pdf`, out, [input]);
    },
  },
  {
    name: "invert",
    summary: "Invert colors (pages become images; text is no longer selectable)",
    usage: "invert <in.pdf> [--pages 1-3] [--dpi 150] [-o out.pdf]",
    options: { ...output, ...pages, dpi: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const dpi = number(values, "dpi", 150, { min: 36, max: 600 });
      const bytes = await read(io, input);
      const targets = selectPages(values, await pageCountOf(bytes));
      const images = await renderPages(
        bytes,
        targets,
        { dpi, format: "jpg", quality: 0.88, invert: true },
        (done, total) => io.progress(`inverting page ${Math.min(done + 1, total)}/${total}`),
      );
      const out = await replacePagesWithImages(
        bytes,
        targets.map((pageIndex, i) => ({ pageIndex, bytes: images[i]!, type: "jpg" as const })),
      );
      await writePdf(io, str(values, "output") ?? `${stem(input)}-inverted.pdf`, out, [input]);
    },
  },
  {
    name: "number",
    summary: "Add page numbers",
    usage:
      "number <in.pdf> [--position bottom-center] [--format n|page-n|n-of-total|page-n-of-total]\n" +
      "                 [--start 1] [--skip-first] [--size 11] [-o out.pdf]",
    options: {
      ...output,
      position: { type: "string" },
      format: { type: "string" },
      start: { type: "string" },
      "skip-first": { type: "boolean" },
      size: { type: "string" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const positions = [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ] as const;
      const formats = ["n", "page-n", "n-of-total", "page-n-of-total"] as const;
      const out = await addPageNumbers(await read(io, input), {
        position: choice<NumberPosition>(values, "position", positions, "bottom-center"),
        format: choice<NumberFormat>(values, "format", formats, "n"),
        startAt: number(values, "start", 1, { min: 0, integer: true }),
        skipFirst: values["skip-first"] === true,
        fontSize: number(values, "size", 11, { min: 4, max: 72 }),
      });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-numbered.pdf`, out, [input]);
    },
  },
  {
    name: "sign",
    summary: "Stamp a signature (or any image) onto pages",
    usage:
      "sign <in.pdf> --image signature.png [--page 1 | --page all] [--x 60%] [--y 82%] [--width 30%]\n" +
      "               [-o out.pdf]\n" +
      "  --x/--y place the image's top-left corner, --width sets its size; all are fractions\n" +
      "  of the page as displayed. The height follows the image's own proportions.",
    options: {
      ...output,
      image: { type: "string" },
      page: { type: "string" },
      x: { type: "string" },
      y: { type: "string" },
      width: { type: "string" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const imagePath = str(values, "image");
      if (!imagePath) throw new UsageError("Give the signature image with --image signature.png.");
      const bytes = await read(io, input);
      const count = await pageCountOf(bytes);
      const pageArg = str(values, "page") ?? "1";
      const targets =
        pageArg === "all"
          ? Array.from({ length: count }, (_, i) => i)
          : parsePageRanges(pageArg, count).flat();
      const image = await prepareImage(await read(io, imagePath)).catch((err: Error) => {
        throw new Error(`${imagePath}: ${err.message}.`);
      });
      const rect = {
        x: fraction(values, "x", 0.6),
        y: fraction(values, "y", 0.82),
        width: fraction(values, "width", 0.3),
      };
      const out = await stampImage(
        bytes,
        image,
        targets.map((pageIndex) => ({ pageIndex, rect })),
      );
      await writePdf(io, str(values, "output") ?? `${stem(input)}-signed.pdf`, out, [
        input,
        imagePath,
      ]);
    },
  },
  {
    name: "compress",
    summary: "Shrink photos and remove unused data",
    usage: "compress <in.pdf> [--level lossless|low|medium|high] [-o out.pdf]",
    options: { ...output, level: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const level = choice(
        values,
        "level",
        ["lossless", "low", "medium", "high"] as const,
        "medium",
      );
      const result = await compress(await read(io, input), compressPresets[level], nodeCodec);
      if (result.newSize >= result.originalSize) {
        io.out(
          `${input} is already compact (${formatSize(result.originalSize)}); nothing written.`,
        );
        return;
      }
      const path = str(values, "output") ?? `${stem(input)}-compressed.pdf`;
      await write(io, path, result.bytes, [input]);
      const saved = Math.round((1 - result.newSize / result.originalSize) * 100);
      io.out(
        `wrote ${path} (${formatSize(result.originalSize)} → ${formatSize(result.newSize)}, ${saved}% smaller)`,
      );
    },
  },
  {
    name: "to-images",
    summary: "Save pages as PNG or JPG files",
    usage: "to-images <in.pdf> [--format png|jpg] [--dpi 150] [--pages 1-3] [-o out-dir]",
    options: { ...output, ...pages, format: { type: "string" }, dpi: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const format = choice(values, "format", ["png", "jpg"] as const, "png");
      const dpi = number(values, "dpi", 150, { min: 36, max: 600 });
      const bytes = await read(io, input);
      const count = await pageCountOf(bytes);
      const targets = selectPages(values, count);
      const images = await renderPages(
        bytes,
        targets,
        { dpi, format, quality: 0.92 },
        (done, total) => io.progress(`rendering page ${Math.min(done + 1, total)}/${total}`),
      );
      const dir = str(values, "output") ?? `${stem(input)}-images`;
      await mkdir(resolve(io.cwd, dir), { recursive: true });
      const width = String(count).length;
      for (const [i, image] of images.entries()) {
        const n = String(targets[i]! + 1).padStart(width, "0");
        await write(io, join(dir, `${stem(input)}-page-${n}.${format}`), image, [input]);
      }
      io.out(`wrote ${plural(images.length, "image")} to ${dir}/`);
    },
  },
  {
    name: "from-images",
    summary: "Make a PDF from images, one per page",
    usage:
      "from-images <a.jpg> [b.png…] [--page-size fit|a4|letter] [--orientation auto|portrait|landscape]\n" +
      "                    [--margin 18] [-o images.pdf]",
    options: {
      ...output,
      "page-size": { type: "string" },
      orientation: { type: "string" },
      margin: { type: "string" },
    },
    async run(inputs, values, io) {
      if (inputs.length === 0) throw new UsageError("Give at least one image.");
      const pageSize = choice(values, "page-size", ["fit", "a4", "letter"] as const, "fit");
      const images = [];
      for (const path of inputs) {
        images.push(
          await prepareImage(await read(io, path)).catch((err: Error) => {
            throw new Error(`${path}: ${err.message}.`);
          }),
        );
      }
      const out = await imagesToPdf(images, {
        pageSize,
        orientation: choice(
          values,
          "orientation",
          ["auto", "portrait", "landscape"] as const,
          "auto",
        ),
        margin: pageSize === "fit" ? 0 : number(values, "margin", 18, { min: 0, max: 200 }),
      });
      await writePdf(io, str(values, "output") ?? "images.pdf", out, inputs);
    },
  },
  {
    name: "dark",
    summary: "Dark mode that keeps text selectable (or a true negative with --negative)",
    usage: "dark <in.pdf> [--negative] [--invert-images] [--pages 1-3] [-o out.pdf]",
    options: {
      ...output,
      ...pages,
      negative: { type: "boolean" },
      "invert-images": { type: "boolean" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const bytes = await read(io, input);
      const negative = values.negative === true;
      const out = await recolorPdf(bytes, {
        mode: negative ? "invert" : "smart",
        keepImages: values["invert-images"] !== true,
        pages: selectPages(values, await pageCountOf(bytes)),
      });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-dark.pdf`, out, [input]);
    },
  },
  {
    name: "redact",
    summary: "Permanently black out text (redacted pages become images)",
    usage:
      "redact <in.pdf> [--find text]… [--pattern email,phone,ssn,cpf,card,iban,date]\n" +
      "                 [--dpi 200] [-o out.pdf]",
    options: {
      ...output,
      find: { type: "string", multiple: true },
      pattern: { type: "string" },
      dpi: { type: "string" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const finds = (values.find as unknown as string[] | undefined) ?? [];
      const names = (str(values, "pattern") ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const name of names) {
        if (!(name in REDACTION_PATTERNS)) {
          throw new UsageError(
            `Unknown pattern "${name}". Use: ${Object.keys(REDACTION_PATTERNS).join(", ")}.`,
          );
        }
      }
      const regexes = [
        ...finds.map((f) => literalPattern(f)),
        ...names.map((n) => REDACTION_PATTERNS[n as RedactionPattern].regex),
      ];
      if (regexes.length === 0)
        throw new UsageError("Say what to redact with --find or --pattern.");
      const dpi = number(values, "dpi", 200, { min: 72, max: 600 });
      const bytes = await read(io, input);
      const runs = await textRunsOf(bytes);
      const boxes = runs.map((pageRuns) => regexes.flatMap((r) => findMatches(pageRuns, r)));
      const targets = boxes.flatMap((b, i) => (b.length ? [i] : []));
      if (targets.length === 0) {
        io.out("Nothing matched; nothing written. (Scanned pages have no text: run OCR first.)");
        return;
      }
      const images = await renderPages(
        bytes,
        targets,
        {
          dpi,
          format: "jpg",
          quality: 0.9,
          paint: (ctx, width, height, i) => {
            ctx.fillStyle = "#000";
            for (const b of boxes[targets[i]!]!) {
              ctx.fillRect(b.x * width, b.y * height, b.width * width, b.height * height);
            }
          },
        },
        (done, total) => io.progress(`redacting page ${Math.min(done + 1, total)}/${total}`),
      );
      const out = await redactPages(
        bytes,
        targets.map((pageIndex, i) => ({
          pageIndex,
          bytes: images[i]!,
          type: "jpg" as const,
          words: keepOutside(runs[pageIndex]!, boxes[pageIndex]!).filter((r) => !r.vertical),
        })),
      );
      const total = targets.reduce((n, i) => n + boxes[i]!.length, 0);
      io.out(`redacted ${plural(total, "match", "matches")} on ${plural(targets.length, "page")}`);
      await writePdf(io, str(values, "output") ?? `${stem(input)}-redacted.pdf`, out, [input]);
    },
  },
  {
    name: "watermark",
    summary: "Stamp text across every page",
    usage: "watermark <in.pdf> --text DRAFT [--across] [--opacity 0.2] [-o out.pdf]",
    options: {
      ...output,
      text: { type: "string" },
      across: { type: "boolean" },
      opacity: { type: "string" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const text = str(values, "text");
      if (!text) throw new UsageError("Give the watermark text with --text.");
      const out = await addWatermark(await read(io, input), {
        text,
        layout: values.across === true ? "horizontal" : "diagonal",
        opacity: number(values, "opacity", 0.2, { min: 0.02, max: 1 }),
      });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-watermarked.pdf`, out, [input]);
    },
  },
  {
    name: "nup",
    summary: "Put several pages on each sheet",
    usage: "nup <in.pdf> [--per 2|4|6|9|16] [--paper a4|letter|a3] [--borders] [-o out.pdf]",
    options: {
      ...output,
      per: { type: "string" },
      paper: { type: "string" },
      borders: { type: "boolean" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const per = Number(choice(values, "per", ["2", "4", "6", "9", "16"] as const, "2"));
      const out = await nUp(await read(io, input), {
        perSheet: per as NUpOptions["perSheet"],
        size: paper(values),
        margin: 18,
        gap: 12,
        borders: values.borders === true,
      });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-${per}up.pdf`, out, [input]);
    },
  },
  {
    name: "booklet",
    summary: "Arrange pages to print double-sided and fold into a booklet",
    usage: "booklet <in.pdf> [--paper a4|letter|a3] [-o out.pdf]",
    options: { ...output, paper: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const out = await booklet(await read(io, input), { size: paper(values), margin: 12 });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-booklet.pdf`, out, [input]);
      io.out('print double-sided with "flip on short edge", then fold in half');
    },
  },
  {
    name: "poster",
    summary: "Enlarge one page across several sheets",
    usage:
      "poster <in.pdf> [--page 1] [--grid 2x2] [--paper a4|letter|a3] [--no-overlap] [-o out.pdf]",
    options: {
      ...output,
      page: { type: "string" },
      grid: { type: "string" },
      paper: { type: "string" },
      "no-overlap": { type: "boolean" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const bytes = await read(io, input);
      const page = number(values, "page", 1, {
        min: 1,
        max: await pageCountOf(bytes),
        integer: true,
      });
      const grid = /^(\d)x(\d)$/.exec(str(values, "grid") ?? "2x2");
      if (!grid) throw new UsageError('--grid looks like "2x2" (across x down).');
      const out = await poster(bytes, {
        pageIndex: page - 1,
        columns: Number(grid[1]),
        rows: Number(grid[2]),
        size: paper(values),
        overlap: values["no-overlap"] === true ? 0 : 28,
      });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-poster.pdf`, out, [input]);
    },
  },
  {
    name: "split-spreads",
    summary: "Cut two-page scans (open books) into single pages",
    usage: "split-spreads <in.pdf> [--horizontal] [--rtl] [-o out.pdf]",
    options: { ...output, horizontal: { type: "boolean" }, rtl: { type: "boolean" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const out = await splitSpreads(await read(io, input), {
        direction: values.horizontal === true ? "horizontal" : "vertical",
        rightToLeft: values.rtl === true,
      });
      await writePdf(io, str(values, "output") ?? `${stem(input)}-split.pdf`, out, [input]);
    },
  },
  {
    name: "protect",
    summary: "Encrypt with a password (AES-256) and/or restrict printing, copying, editing",
    usage:
      "protect <in.pdf> [--password pw] [--owner-password pw] [--no-print] [--no-copy] [--no-edit]\n" +
      "                  [-o out.pdf]",
    options: {
      ...output,
      password: { type: "string" },
      "owner-password": { type: "string" },
      "no-print": { type: "boolean" },
      "no-copy": { type: "boolean" },
      "no-edit": { type: "boolean" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const out = await encryptPdf(await read(io, input), {
        userPassword: str(values, "password") ?? "",
        ownerPassword: str(values, "owner-password") ?? "",
        allowPrinting: values["no-print"] !== true,
        allowCopying: values["no-copy"] !== true,
        allowEditing: values["no-edit"] !== true,
      });
      const path = str(values, "output") ?? `${stem(input)}-protected.pdf`;
      await write(io, path, out, [input]);
      io.out(`wrote ${path} (${formatSize(out.length)}, encrypted)`);
    },
  },
  {
    name: "unlock",
    summary: "Remove a PDF's password (you need to know it) and its restrictions",
    usage: "unlock <in.pdf> [--password pw] [-o out.pdf]",
    options: { ...output, password: { type: "string" } },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const out = await decryptPdf(await read(io, input), str(values, "password") ?? "");
      await writePdf(io, str(values, "output") ?? `${stem(input)}-unlocked.pdf`, out, [input]);
    },
  },
  {
    name: "repair",
    summary: "Rebuild a damaged PDF",
    usage: "repair <in.pdf> [-o out.pdf]",
    options: { ...output },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const out = await repairPdf(await read(io, input));
      await writePdf(io, str(values, "output") ?? `${stem(input)}-repaired.pdf`, out, [input]);
    },
  },
  {
    name: "web",
    summary: 'Optimize for fast web view ("linearize")',
    usage: "web <in.pdf> [-o out.pdf]",
    options: { ...output },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const out = await linearizePdf(await read(io, input));
      await writePdf(io, str(values, "output") ?? `${stem(input)}-web.pdf`, out, [input]);
    },
  },
  {
    name: "extract-images",
    summary: "Save embedded photos and graphics at their original quality",
    usage: "extract-images <in.pdf> [-o out-dir]",
    options: { ...output },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const { images, skipped } = await extractImages(await read(io, input));
      const dir = str(values, "output") ?? `${stem(input)}-images`;
      await mkdir(resolve(io.cwd, dir), { recursive: true });
      const perPage = new Map<number, number>();
      for (const image of images) {
        const n = (perPage.get(image.page) ?? 0) + 1;
        perPage.set(image.page, n);
        await write(io, join(dir, `page-${image.page}-image-${n}.${image.ext}`), image.bytes, [
          input,
        ]);
      }
      io.out(
        `wrote ${plural(images.length, "image")} to ${dir}/` +
          (skipped ? ` (${skipped} in unsupported formats skipped)` : ""),
      );
    },
  },
  {
    name: "sign-cert",
    summary: "Digitally sign with a certificate (.p12/.pfx)",
    usage:
      "sign-cert <in.pdf> --cert id.p12 [--password pw] [--reason text] [--location text]\n" +
      "                    [--visible] [-o out.pdf]",
    options: {
      ...output,
      cert: { type: "string" },
      password: { type: "string" },
      reason: { type: "string" },
      location: { type: "string" },
      visible: { type: "boolean" },
    },
    async run(positionals, values, io) {
      const input = onlyInput(positionals);
      const cert = str(values, "cert");
      if (!cert) throw new UsageError("Give the certificate file with --cert.");
      const bytes = await read(io, input);
      const out = await signPdfDigitally(bytes, {
        p12: await read(io, cert),
        password: str(values, "password") ?? "",
        reason: str(values, "reason"),
        location: str(values, "location"),
        appearance:
          values.visible === true
            ? {
                pageIndex: (await pageCountOf(bytes)) - 1,
                box: { x: 0.52, y: 0.84, width: 0.43, height: 0.1 },
              }
            : undefined,
      });
      const path = str(values, "output") ?? `${stem(input)}-signed.pdf`;
      await write(io, path, out, [input, cert]);
      io.out(`wrote ${path} (signed)`);
    },
  },
  {
    name: "verify",
    summary: "Check digital signatures",
    usage: "verify <in.pdf>",
    options: {},
    async run(positionals, _values, io) {
      const input = onlyInput(positionals);
      const reports = await verifySignatures(await read(io, input));
      if (reports.length === 0) {
        io.out("no digital signatures");
        return;
      }
      let bad = false;
      for (const r of reports) {
        const ok = r.intact && r.validSignature;
        bad ||= !ok;
        io.out(
          `${ok ? "valid" : "INVALID"}: signed by ${r.signer}${r.signedAt ? ` on ${r.signedAt}` : ""}`,
        );
        if (!r.intact) io.out("  the document changed after signing");
        if (!r.validSignature) io.out("  the signature doesn't match the certificate");
        if (!r.coversWholeFile) io.out("  more was added to the file after this signature");
        io.out(`  certificate: ${r.selfSigned ? "self-signed" : `issued by ${r.issuer}`}`);
        if (r.problem) io.out(`  ${r.problem}`);
      }
      if (bad) throw new Error("at least one signature is invalid.");
    },
  },
  {
    name: "bookmarks",
    summary: "List the document's bookmarks",
    usage: "bookmarks <in.pdf>",
    options: {},
    async run(positionals, _values, io) {
      const input = onlyInput(positionals);
      const outline = readOutline(await loadPdf(await read(io, input)));
      if (outline.length === 0) io.out("no bookmarks");
      for (const b of outline)
        io.out(`${"  ".repeat(b.level)}${b.title}  (page ${b.pageIndex + 1})`);
    },
  },
  {
    name: "info",
    summary: "Show page count, page sizes and metadata",
    usage: "info <in.pdf>",
    options: {},
    async run(positionals, _values, io) {
      const input = onlyInput(positionals);
      const bytes = await read(io, input);
      const doc = await loadPdf(bytes);
      const sizes = new Map<string, number>();
      for (const page of doc.getPages()) {
        const { width, height } = page.getCropBox();
        const rotated = page.getRotation().angle % 180 !== 0;
        const [w, h] = rotated ? [height, width] : [width, height];
        const key = `${Math.round(w)} × ${Math.round(h)} pt`;
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
      }
      io.out(`file:   ${input} (${formatSize(bytes.length)})`);
      io.out(`pages:  ${doc.getPageCount()}`);
      for (const [size, n] of sizes)
        io.out(`size:   ${size}${sizes.size > 1 ? ` (${plural(n, "page")})` : ""}`);
      const title = doc.getTitle();
      const author = doc.getAuthor();
      if (title) io.out(`title:  ${title}`);
      if (author) io.out(`author: ${author}`);
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Entry point

const BIN = "epdf";

function help(): string {
  const width = Math.max(...commands.map((c) => c.name.length));
  return [
    `usage: ${BIN} <command> [options]`,
    "",
    "commands:",
    ...commands.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
    "",
    `Page lists look like 1-3,5,8- (8- means page 8 to the end).`,
    `Run "${BIN} <command> --help" for a command's options.`,
  ].join("\n");
}

/**
 * Node's parser reads "--angle -90" as two options. Glue a negative number onto the option
 * before it ("--angle=-90") so the natural spelling works.
 */
function joinNegativeNumbers(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const next = args[i + 1];
    if (/^--[\w-]+$/.test(arg) && next !== undefined && /^-\d+(\.\d+)?%?$/.test(next)) {
      out.push(`${arg}=${next}`);
      i++;
    } else {
      out.push(arg);
    }
  }
  return out;
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "help" || name === "--help" || name === "-h") {
    io.out(help());
    return 0;
  }
  const command = commands.find((c) => c.name === name);
  if (!command) {
    io.err(`${BIN}: unknown command "${name}".\n\n${help()}`);
    return 2;
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    io.out(`usage: ${BIN} ${command.usage}`);
    return 0;
  }

  try {
    const { values, positionals } = parseArgs({
      args: joinNegativeNumbers(rest),
      options: command.options,
      allowPositionals: true,
      strict: true,
    });
    await command.run(positionals, values as Values, io);
    return 0;
  } catch (err) {
    if (
      err instanceof UsageError ||
      (err as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")
    ) {
      io.err(`${BIN} ${name}: ${(err as Error).message}\nusage: ${BIN} ${command.usage}`);
      return 2;
    }
    io.err(`${BIN} ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
