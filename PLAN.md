# Everything PDF — Plan

A website that does everything you'd want to do with a PDF: merge, split, reorder, rotate, invert colors, compress, convert, sign, redact, OCR, and more. All in one place, with no sign-up.

---

## 1. Guiding principles

1. **Private by default: process files in the browser.** Most PDF operations can run fully client-side with JavaScript and WebAssembly. Files never leave the user's machine unless an operation truly needs a server (e.g. Office → PDF conversion). Those operations are clearly labeled.
2. **One workspace, many tools.** The user loads PDFs once into a visual page-thumbnail workspace and applies operations in sequence (invert → remove pages → merge → compress → download) without re-uploading between steps.
3. **Non-destructive until export.** Every operation is recorded as a step in a pipeline with undo/redo. The original file is kept until the user downloads.
4. **Fast on big files.** Heavy work runs in Web Workers so the UI never freezes. Thumbnails render lazily.
5. **Works offline.** Installable PWA; client-side tools work without a network connection.

---

## 2. Feature catalog

Priority: **P0** = MVP, **P1** = next, **P2** = later/nice-to-have.
Runs: **C** = client-side, **S** = needs a server (or a heavy optional WASM bundle).

### 2.1 Organize pages

| Feature                       | Description                                                                                          | Priority | Runs |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | -------- | ---- |
| Merge                         | Combine multiple PDFs into one, in a chosen order                                                    | P0       | C    |
| Split                         | Split by every N pages, by page ranges, by file size, by bookmarks/outline, or into single pages     | P0       | C    |
| Extract pages                 | Pull selected pages into a new PDF                                                                   | P0       | C    |
| Delete pages                  | Remove selected pages                                                                                | P0       | C    |
| Reorder pages                 | Drag-and-drop thumbnails; reverse order; sort                                                        | P0       | C    |
| Rotate pages                  | 90/180/270°, per page or all pages                                                                   | P0       | C    |
| Duplicate pages               | Copy a page in place                                                                                 | P1       | C    |
| Insert blank page             | Add an empty page of matching or custom size                                                         | P1       | C    |
| Insert pages from another PDF | Insert at a specific position                                                                        | P1       | C    |
| Interleave / collate          | Alternate pages from two PDFs (e.g. front-side scans + back-side scans, with the back side reversed) | P1       | C    |
| Odd/even page selection       | Select or extract odd or even pages                                                                  | P1       | C    |
| Split double-page scans       | Cut each landscape spread into two portrait pages                                                    | P2       | C    |
| N-up / page imposition        | 2, 4, 6, 9 pages per sheet; booklet/saddle-stitch layout                                             | P2       | C    |
| Poster / tile                 | Split one large page across multiple printable sheets                                                | P2       | C    |

### 2.2 Page appearance and geometry

| Feature                        | Description                                                                                                                                                                                                                    | Priority | Runs          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------- |
| Invert colors                  | True negative (dark mode for reading/printing). Two modes: **raster** (render → invert → re-embed; works on anything, loses text selection) and **vector** (rewrite content-stream colors; keeps text selectable, best effort) | P0       | C             |
| Grayscale / black & white      | Convert to grayscale, or threshold to pure B&W for printing                                                                                                                                                                    | P1       | C             |
| Adjust brightness/contrast     | Mainly for scanned documents                                                                                                                                                                                                   | P2       | C             |
| Crop pages                     | Visual crop box; apply to one page, all pages, or odd/even pages                                                                                                                                                               | P1       | C             |
| Auto-crop whitespace           | Detect and trim margins                                                                                                                                                                                                        | P2       | C             |
| Resize / change page size      | Scale to A4, Letter, etc., or a custom size; fit or fill                                                                                                                                                                       | P1       | C             |
| Add margins / padding          | Expand the page canvas (e.g. a binding margin)                                                                                                                                                                                 | P2       | C             |
| Flip / mirror                  | Horizontal or vertical                                                                                                                                                                                                         | P2       | C             |
| Deskew                         | Straighten crooked scans                                                                                                                                                                                                       | P2       | C (OpenCV.js) |
| Remove background / clean scan | Whiten paper and remove speckles                                                                                                                                                                                               | P2       | C             |

### 2.3 Add content

| Feature             | Description                                                                         | Priority | Runs |
| ------------------- | ----------------------------------------------------------------------------------- | -------- | ---- |
| Page numbers        | Position, format ("Page 1 of N", roman numerals), start number, skip the first page | P0       | C    |
| Watermark (text)    | Text, font, size, color, opacity, rotation, tiled or single                         | P1       | C    |
| Watermark (image)   | Logo or stamp with opacity and position                                             | P1       | C    |
| Headers / footers   | Text with variables (date, filename, page)                                          | P1       | C    |
| Bates numbering     | Legal sequential numbering with prefix/suffix across multiple files                 | P2       | C    |
| Add text            | Click anywhere to place a text box                                                  | P1       | C    |
| Add images          | Place PNG/JPG/SVG on a page                                                         | P1       | C    |
| Shapes and drawing  | Rectangles, lines, arrows, freehand ink                                             | P2       | C    |
| Annotations         | Highlight, underline, strikethrough, sticky notes, comments                         | P1       | C    |
| Stamps              | "APPROVED", "DRAFT", "CONFIDENTIAL", custom                                         | P2       | C    |
| Hyperlinks          | Add, edit, or remove links                                                          | P2       | C    |
| Bookmarks / outline | Add, edit, and reorder the table of contents; auto-generate from headings           | P2       | C    |

### 2.4 Edit existing content

| Feature                           | Description                                                                                                | Priority | Runs |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | ---- |
| Edit existing text                | Change text in place. Hard in general because PDFs aren't word processors; start with "whiteout + overlay" | P2       | C    |
| Whiteout                          | Cover an area with a white (or any color) box                                                              | P1       | C    |
| Find & replace text               | Best effort; works for simple PDFs                                                                         | P2       | C/S  |
| Remove annotations                | Strip all comments and markups                                                                             | P1       | C    |
| Flatten                           | Burn annotations and form fields into page content                                                         | P1       | C    |
| Remove images / remove text layer | Strip specific content types                                                                               | P2       | C    |

### 2.5 Forms

| Feature                 | Description                                                             | Priority | Runs |
| ----------------------- | ----------------------------------------------------------------------- | -------- | ---- |
| Fill forms              | Detect AcroForm fields and fill them in the UI                          | P1       | C    |
| Create form fields      | Add text fields, checkboxes, radio buttons, dropdowns, signature fields | P2       | C    |
| Flatten form            | Lock filled values into the page                                        | P1       | C    |
| Export/import form data | FDF/XFDF/JSON                                                           | P2       | C    |

### 2.6 Sign

| Feature                           | Description                                                        | Priority | Runs                              |
| --------------------------------- | ------------------------------------------------------------------ | -------- | --------------------------------- |
| Visual signature                  | Draw, type (script fonts), or upload an image; place and resize it | P0       | C                                 |
| Initials / date stamps            | Quick-place helpers                                                | P1       | C                                 |
| Saved signatures                  | Stored locally in the browser (IndexedDB)                          | P1       | C                                 |
| Digital (cryptographic) signature | PKCS#7/PAdES signing with a user-provided .p12/.pfx certificate    | P2       | C (node-forge / pdf-lib + signer) |
| Verify signatures                 | Show whether the existing signatures are valid                     | P2       | C/S                               |

### 2.7 Security and privacy

| Feature                | Description                                                                                                                                                                               | Priority | Runs           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| Add password (encrypt) | AES-256; user and owner passwords                                                                                                                                                         | P1       | C (qpdf-wasm)  |
| Remove password        | Requires the known password                                                                                                                                                               | P1       | C (qpdf-wasm)  |
| Set permissions        | Disallow printing, copying, editing                                                                                                                                                       | P2       | C (qpdf-wasm)  |
| Redact                 | **True** redaction: remove the underlying text and image data, not just draw a black box. Supports manual area selection plus search-based redaction (emails, phone numbers, SSNs, regex) | P1       | C (MuPDF WASM) |
| Remove metadata        | Strip author, producer, dates, XMP, and hidden data                                                                                                                                       | P1       | C              |
| Sanitize               | Remove JavaScript, embedded files, and external links                                                                                                                                     | P2       | C              |

### 2.8 Optimize and repair

| Feature                     | Description                                                                                     | Priority | Runs                |
| --------------------------- | ----------------------------------------------------------------------------------------------- | -------- | ------------------- |
| Compress                    | Presets (low/medium/high): downsample and re-encode images, remove unused objects, subset fonts | P0       | C (WASM)            |
| Linearize ("fast web view") | Optimize for streaming                                                                          | P2       | C (qpdf-wasm)       |
| Repair                      | Rebuild a broken xref table and recover corrupted files                                         | P1       | C (qpdf/MuPDF WASM) |
| PDF/A conversion            | Archival format                                                                                 | P2       | S (Ghostscript)     |
| Compare two PDFs            | Side-by-side text diff plus visual pixel diff                                                   | P2       | C                   |

### 2.9 Convert **from** PDF

| Feature                         | Description                                                | Priority | Runs |
| ------------------------------- | ---------------------------------------------------------- | -------- | ---- |
| PDF → images                    | PNG/JPG/WebP per page with a DPI choice; download as a ZIP | P0       | C    |
| PDF → text                      | Plain-text extraction                                      | P1       | C    |
| PDF → Markdown / HTML           | Structured extraction                                      | P2       | C    |
| Extract images                  | Pull the embedded images out at their original quality     | P1       | C    |
| Extract attachments             | Embedded files                                             | P2       | C    |
| PDF → Word / Excel / PowerPoint | Hard to do well; server-side                               | P2       | S    |

### 2.10 Convert **to** PDF

| Feature                         | Description                                                                                    | Priority | Runs          |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ------------- |
| Images → PDF                    | JPG/PNG/WebP/HEIC; page size, margins, orientation, one image per page or fit several per page | P0       | C             |
| Text / Markdown → PDF           | Simple typesetting                                                                             | P2       | C             |
| HTML / URL → PDF                | Headless Chromium                                                                              | P2       | S             |
| Word / Excel / PowerPoint → PDF | LibreOffice headless                                                                           | P2       | S             |
| Scan with camera → PDF          | Mobile: capture, auto-detect edges, perspective-correct, enhance                               | P2       | C (OpenCV.js) |

### 2.11 Read and analyze

| Feature                | Description                                                                                              | Priority | Runs             |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| Viewer                 | Fast viewer with zoom, search, and thumbnails                                                            | P0       | C                |
| OCR                    | Make scanned PDFs searchable (invisible text layer); multi-language                                      | P1       | C (Tesseract.js) |
| Info / inspector       | Page count, sizes, fonts, images, PDF version, encryption, metadata, and the object tree for power users | P1       | C                |
| Word / character count | Per page and total                                                                                       | P2       | C                |
| AI features (optional) | Summarize, ask questions, translate. Requires sending text to an LLM, so it is opt-in only               | P2       | S                |

### 2.12 Workflow and convenience

| Feature               | Description                                                                  | Priority | Runs |
| --------------------- | ---------------------------------------------------------------------------- | -------- | ---- |
| Download              | Single PDF, or a ZIP for multi-output operations (split, images)             | P0       | C    |
| Custom filename       | Rename before download                                                       | P0       | C    |
| Undo / redo           | Across all operations in a session                                           | P0       | C    |
| Batch processing      | Apply the same operation to many files at once                               | P1       | C    |
| Pipelines / recipes   | Save a sequence of steps (e.g. "invert → grayscale → compress") and reuse it | P2       | C    |
| Drag and drop / paste | Drop files anywhere; paste from the clipboard                                | P0       | C    |
| Keyboard shortcuts    | Delete, rotate, select all, undo                                             | P1       | C    |
| Dark mode UI          | Separate from the "invert PDF" feature                                       | P1       | C    |
| Share target (PWA)    | "Share to Everything PDF" from the phone's share sheet                       | P2       | C    |

---

## 3. Architecture

### 3.1 High level

```
┌──────────────────────────── Browser ─────────────────────────────┐
│                                                                  │
│  UI (React)  ──►  Document Store (Zustand)  ──►  Op Pipeline     │
│     │               - files, pages, selection     - undo/redo    │
│     │               - history stack                              │
│     ▼                                                            │
│  Thumbnail renderer (pdf.js, lazy, in worker)                    │
│                                                                  │
│  Engine Worker(s) ── Comlink ──►  pdf-lib        (structure ops) │
│                                   pdf.js         (render/text)   │
│                                   MuPDF WASM     (redact/compress│
│                                                   /repair/vector)│
│                                   qpdf WASM      (encrypt/linear)│
│                                   Tesseract.js   (OCR)           │
│                                   OpenCV.js      (scan cleanup)  │
└──────────────────────────────────────────────────────────────────┘
                     │ (only for ops marked "S", opt-in)
                     ▼
┌──────────────── Optional conversion API ─────────────────────────┐
│  Container: LibreOffice (Office ↔ PDF), Ghostscript (PDF/A),     │
│  Chromium (HTML→PDF). Stateless, files deleted after response.   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Tech stack

| Concern       | Choice                                              | Why                                                                                                 |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Framework     | **Vite + React + TypeScript**                       | The app is almost entirely client-side, so it needs no server framework; it deploys as static files |
| Routing       | TanStack Router or React Router                     | One route per tool (`/merge`, `/invert`, …) for SEO and deep links                                  |
| Styling       | Tailwind CSS + shadcn/ui                            | Fast, accessible components                                                                         |
| State         | Zustand (+ immer)                                   | Simple store with snapshot-friendly undo/redo                                                       |
| Drag and drop | dnd-kit                                             | Thumbnail grid reordering                                                                           |
| Workers       | Comlink                                             | Clean async API to Web Workers                                                                      |
| Storage       | IndexedDB (via `idb`)                               | Large file blobs, saved signatures, recipes                                                         |
| PWA           | vite-plugin-pwa                                     | Offline use and installability                                                                      |
| Testing       | Vitest (engine unit tests), Playwright (end-to-end) |                                                                                                     |
| Hosting       | Cloudflare Pages / Vercel / Netlify (static)        | Free tier is enough; the optional API runs on Fly.io / Cloud Run                                    |

### 3.3 PDF libraries and what each one is for

| Library                 | Use it for                                                                                            | Notes                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **pdf-lib**             | Merge, split, reorder, rotate, delete, insert, page numbers, watermarks, text/images, forms, metadata | Pure JS, MIT; the backbone for most P0/P1 operations                                                   |
| **pdf.js** (pdfjs-dist) | Rendering thumbnails and the viewer, text extraction, raster operations (invert, grayscale, to-image) | Apache-2.0                                                                                             |
| **MuPDF.js** (WASM)     | True redaction, compression, repair, vector color rewriting, better text extraction                   | **AGPL**: fine if this repo is open source; otherwise it needs a commercial license or must be avoided |
| **qpdf-wasm**           | Encryption/decryption, linearization, repair                                                          | Apache-2.0                                                                                             |
| **Tesseract.js**        | OCR                                                                                                   | Apache-2.0; language data loads on demand                                                              |
| **OpenCV.js**           | Deskew, edge detection for camera scans, cleanup                                                      | Large; lazy-load it only on the tools that need it                                                     |
| **JSZip** / **fflate**  | ZIP downloads                                                                                         |                                                                                                        |
| **heic2any**            | HEIC → JPG before Images → PDF                                                                        |                                                                                                        |

> **Licensing decision:** If the repo will be public and open source (AGPL-compatible), MuPDF is the strongest single engine and can replace several others. If you want to stay permissive (MIT), use pdf-lib + pdf.js + qpdf-wasm and skip or postpone true redaction and advanced compression.

### 3.4 Core abstraction: operations

Every tool is an `Operation` with the same shape, so tools can be chained, batched, and undone uniformly:

```ts
interface Operation<Params> {
  id: string; // "invert", "merge", "rotate", ...
  label: string;
  category:
    | "organize"
    | "appearance"
    | "add"
    | "edit"
    | "forms"
    | "sign"
    | "security"
    | "optimize"
    | "convert"
    | "analyze";
  runsOn: "client" | "server";
  inputs: "single" | "multiple";
  paramsSchema: ZodSchema<Params>; // drives the auto-generated settings form
  run(input: PdfBytes[], params: Params, ctx: OpContext): Promise<OpResult>;
}

type OpResult =
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "pdfs"; files: { name: string; bytes: Uint8Array }[] } // split
  | { kind: "images"; files: { name: string; bytes: Uint8Array }[] } // to-image
  | { kind: "text"; text: string }
  | { kind: "info"; data: unknown };
```

- A **registry** lists all operations, which powers the home page grid, search ("⌘K: invert"), and routing.
- Page-level edits in the workspace (reorder, rotate, delete) are kept as a lightweight **page model**: `[{ sourceFileId, sourcePageIndex, rotation }]`. They are only materialized into a real PDF on export or when a heavier operation needs real bytes. This makes drag-and-drop instant even for 500-page files.
- **Undo/redo** = a stack of `{ pageModel, fileBytesRefs }` snapshots (bytes are stored once in IndexedDB and referenced by hash).

### 3.5 Repo layout

```
everything-pdf/
├── apps/
│   ├── web/                    # Vite + React app
│   │   ├── src/
│   │   │   ├── routes/         # one route per tool + workspace
│   │   │   ├── components/     # Thumbnail grid, Dropzone, Viewer, ToolPanel
│   │   │   ├── store/          # Zustand document store, history
│   │   │   ├── workers/        # engine.worker.ts, render.worker.ts
│   │   │   └── tools/          # UI panel per tool (auto-forms from schema)
│   │   └── public/
│   └── api/                    # (later) optional conversion service, Dockerized
├── packages/
│   └── engine/                 # framework-free PDF operations (testable in Node)
│       ├── src/ops/            # merge.ts, split.ts, invert.ts, ...
│       ├── src/registry.ts
│       └── test/fixtures/      # sample PDFs: encrypted, scanned, forms, huge, broken
├── PLAN.md
└── package.json                # npm workspaces
```

Keeping `packages/engine` free of React means every operation can be unit-tested in Node against fixture PDFs, and could later power a CLI (`npx everything-pdf merge a.pdf b.pdf`).

---

## 4. UX

### 4.1 Two ways in

1. **Tool pages** (`/merge`, `/invert`, `/compress`, …): a single-purpose flow of drop file → set options → download. Good for SEO and for users who know what they want.
2. **Workspace** (`/workspace`): a thumbnail grid of all loaded files and pages. Select pages and apply any tool from a toolbar or the command palette, chain operations, and export at the end. This is the "power user" mode and the main differentiator.

Both use the same engine and operations.

### 4.2 Key screens

- **Home:** search bar plus a grid of tools grouped by category, with the most-used tools at the top (Merge, Split, Compress, Invert, Rotate, Sign, PDF → Images, Images → PDF).
- **Workspace:**
  - Left: list of loaded files (collapsible)
  - Center: page thumbnail grid (drag to reorder, shift/cmd-click multi-select, hover actions: rotate/delete/duplicate)
  - Right: options panel for the active tool
  - Top bar: undo/redo, history, filename, **Download** button
- **Page editor** (for sign, annotate, add text, whiteout, crop, redact): a single large page with a canvas overlay for placing and transforming objects.

### 4.3 Must-haves

- Drag-and-drop anywhere, a file picker, and paste.
- A progress indicator for long operations, with cancel.
- Clear errors: "This PDF is password-protected — enter the password", "This file appears corrupted — try Repair".
- Badges on tools that use a server: "☁ Uploads your file".
- Responsive layout; the touch-friendly thumbnail grid works on phones.
- Accessibility: keyboard reordering of pages, ARIA labels, focus management.

---

## 5. Implementation notes for tricky features

- **Invert colors.**
  - _Raster mode (P0):_ render each page with pdf.js at a chosen DPI (150–300) → `ctx.filter = "invert(1)"` or invert the pixel buffer → encode as JPEG/PNG → build a new PDF with pdf-lib where each page is the image at the original page size. Optionally run OCR afterwards to restore searchable text.
  - _Vector mode (P1/P2):_ parse each content stream and invert color operators (`rg/RG`, `g/G`, `k/K`, `sc/scn`) while inverting embedded images separately. Add a full-page white→black background rectangle. MuPDF makes this much easier. A "Smart dark mode" variant keeps images un-inverted.
- **Compression.** Re-encode images (JPEG quality and max DPI per preset), drop duplicate objects, remove unused resources, and use object streams. Show the before/after size, and keep the original if the "compressed" file is bigger.
- **Redaction.** Must delete the underlying content, not only cover it. Verify by extracting the text after redaction and asserting the redacted strings are gone (add this as an automated test).
- **Large files.** Never hold more than the necessary page renders in memory. Thumbnail renders use `OffscreenCanvas` in a worker with an LRU cache. Test with a 1,000-page and a 500 MB fixture.
- **Encrypted inputs.** Detect encryption on load and prompt for the password before any operation.
- **Fonts.** pdf-lib's standard fonts are Latin-only. Bundle a Noto subset for non-Latin text (watermarks, page numbers, signatures in other scripts).

---

## 6. Roadmap

### Phase 0: Setup ✅

- [x] Monorepo (npm workspaces), Vite + React + TS, Tailwind, ESLint/Prettier
- [x] `packages/engine` with Vitest and a fixture folder
- [x] CI (GitHub Actions): typecheck, lint, format, test, build
- [ ] Deploy a static preview (Cloudflare Pages / Vercel): needs an account connected to the repo

### Phase 1: MVP ✅

- [x] Dropzone, file loading, encrypted-file detection
- [x] pdf.js thumbnail grid, rendered lazily as pages scroll into view
- [x] Workspace page model: **reorder, rotate, delete, extract, duplicate**
- [x] **Merge**, **Split** (ranges / every N / single pages)
- [x] **Invert colors** (raster mode)
- [x] **Images → PDF**, **PDF → Images** (ZIP)
- [x] **Page numbers**
- [x] **Visual signature** (draw/type/upload, place)
- [x] **Compress** (basic image re-encoding)
- [x] Undo/redo, download with filename, ZIP for multi-output
- [x] Home page with tool grid + per-tool routes

Notes on how Phase 1 differs from the original plan:

- **npm workspaces instead of pnpm**: pnpm wasn't installed, and npm workspaces do the same job here.
- **No shadcn/ui yet**: a small set of hand-written Tailwind components (`components/ui.tsx`) covers
  what the MVP needs.
- **Thumbnails render on the main thread.** pdf.js already parses in its own worker; only the
  final canvas paint happens on the page. Moving rendering to an `OffscreenCanvas` worker is
  worth doing if very large files feel sluggish.
- **Work is kept in memory, not IndexedDB.** Closing the tab loses unsaved work (the app warns
  first). Moving files and history into IndexedDB belongs with saved signatures in Phase 2.
- **Compression re-encodes JPEG images only.** Lossless (Flate) images are left alone, and
  unreferenced objects are removed.
- **HEIC images** work only where the browser can decode them (Safari).
- **Tool parameters use hand-written panels**, not forms generated from a Zod schema. The panels
  needed custom controls (position picker, signature pad) that a generated form wouldn't give.

### Phase 2: Core power tools ✅

- [x] Watermark (text and image), headers/footers
- [x] Crop, resize page size, grayscale
- [x] Add text, add images, whiteout, annotations (highlight/notes)
- [x] Fill and flatten forms; remove annotations
- [x] Encrypt / decrypt / permissions (qpdf-wasm)
- [x] Remove metadata; info/inspector panel
- [x] Insert blank pages / pages from another PDF; interleave
- [x] OCR (Tesseract.js) → searchable PDF
- [x] PDF → text, extract images
- [x] Batch mode
- [x] PWA / offline, keyboard shortcuts, command palette

Notes on how Phase 2 differs from the original plan:

- **Forms and document properties now survive the workspace.** `assemble` rebuilds the form's
  field list from the copied pages' widgets, and writes the workspace's document properties
  (or strips all metadata). Document-level extras (attachments, scripts, bookmarks) are still
  dropped; the properties panel says so when a file has them.
- **Encryption uses `@neslinesli93/qpdf-wasm`** (qpdf 12, ISC). Protecting a file downloads an
  encrypted copy; the workspace itself stays unencrypted. Encrypted files are unlocked as
  they're loaded (password prompt; restriction-only files unlock silently).
- **Text everywhere uses the standard PDF fonts**, so it's Latin-only (accents included). Text
  outside that range is refused with a clear message, and OCR leaves it out of the text layer.
  Bundling a Noto subset is still to do.
- **OCR downloads Tesseract's engine and language data from jsDelivr** on first use (cached
  after). Pages are recognized locally; nothing is uploaded.
- **The service worker is hand-written** (a small Vite plugin lists the build's files), instead
  of vite-plugin-pwa/Workbox. Everything except OCR works offline after the first visit.
- **Extract images** saves JPEG/JPEG 2000 as stored and decodes gray/RGB/indexed images to PNG.
  CMYK, JBIG2 and CCITT images are skipped (and counted).
- **Batch mode** covers compress, page numbers, header & footer, watermark, rotate, resize,
  grayscale, remove metadata, remove annotations and protect.
- **Still in memory, not IndexedDB.** Saved signatures and persisted sessions remain open.

### Phase 3: Advanced (ongoing)

- [ ] True redaction (search-based + manual) with MuPDF
- [ ] Vector invert / smart dark mode
- [ ] Repair, linearize, better compression presets
- [ ] Compare PDFs (text and visual diff)
- [ ] Bookmarks editor, hyperlinks, form field creation
- [ ] N-up, booklet, poster tiling, split double-page scans
- [ ] Camera scan → PDF with edge detection and enhancement
- [ ] Saved recipes/pipelines
- [ ] Digital (cryptographic) signatures and verification
- [ ] CLI package built on `packages/engine`

### Phase 4: Server-side extras (optional)

- [ ] Dockerized API: LibreOffice (Office ↔ PDF), Ghostscript (PDF/A), Chromium (HTML/URL → PDF)
- [ ] Stateless processing; files deleted right after the response; rate limiting; size caps
- [ ] Opt-in AI tools (summarize, Q&A, translate)

---

## 7. Testing strategy

- **Engine unit tests:** each operation runs against fixtures, with assertions on page count, page sizes, rotation, extracted text, and that the output parses cleanly with a second library (round-trip through pdf.js).
- **Fixture set:** simple text PDF, scanned image PDF, form PDF, encrypted PDF, mixed page sizes, rotated pages, non-Latin text, a 1,000-page file, a malformed/corrupted file, and a PDF with annotations and links.
- **Visual regression:** render outputs to PNG and compare them against golden images (invert, watermark, crop, N-up).
- **Security tests:** redaction leaves no recoverable text; metadata removal leaves no metadata; encrypted output can't be opened without the password.
- **E2E (Playwright):** the main flows: drop → merge → download; workspace reorder → export; sign → download.
- **Performance budgets:** first thumbnail in under 500 ms for a typical file; merging two 100-page files in under 2 s on a mid-range laptop.

---

## 8. Open decisions

1. **License:** MIT (skip MuPDF for now) or AGPL (use MuPDF for redaction, compression, and vector invert)?
2. **Server-side features:** build them at all, or stay 100% client-side?
3. **Name / domain** for the site.
4. **Monetization**, if any: none, donations, or a paid tier for server-side conversions?
