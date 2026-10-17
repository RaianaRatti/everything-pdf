import { emptyDocInfo, type Bookmark, type DocInfo } from "@everything-pdf/engine/pure";
import { create } from "zustand";
import { closeUnusedPdfs } from "../lib/pdfjs";
import { uid } from "../lib/files";

/** An uploaded (or generated) PDF. Its bytes are never mutated. */
export interface SourceFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  /** Document properties read when the file was loaded. */
  info?: DocInfo;
  /** The file was password-protected and has been decrypted. */
  unlocked?: boolean;
  /** The file was damaged and has been rebuilt. */
  repaired?: boolean;
  /** Bookmarks read when the file was loaded (by page index in this file). */
  outline?: Bookmark[];
}

/**
 * One page in the workspace: a pointer into a source file plus extra rotation. Reordering,
 * rotating, deleting and duplicating only touch this list, so they're instant even for huge
 * files; real PDF bytes are produced on download or when an operation needs them.
 */
export interface PageItem {
  id: string;
  fileId: string;
  pageIndex: number;
  rotation: number;
}

/** A bookmark in the workspace; it follows its page wherever the page moves. */
export interface BookmarkItem {
  id: string;
  title: string;
  pageId: string;
  level: number;
}

interface Snapshot {
  files: Record<string, SourceFile>;
  pages: PageItem[];
  bookmarks: BookmarkItem[];
}

export interface Notice {
  kind: "error" | "success";
  message: string;
}

export type SelectMode = "single" | "toggle" | "range";

interface WorkspaceState extends Snapshot {
  selection: string[];
  /** Last page clicked without Shift; the fixed end of Shift-click ranges. */
  anchor: string | null;
  past: Snapshot[];
  future: Snapshot[];
  outputName: string;
  /** Properties written into downloads. null = strip all metadata. */
  docInfo: DocInfo | null;
  busy: string | null;
  notice: Notice | null;

  addFiles(files: SourceFile[]): void;
  /** Adds files with their pages inserted before position `at` in the page list. */
  insertFiles(files: SourceFile[], at: number): void;
  replaceDocument(file: SourceFile): void;
  setPages(pages: PageItem[]): void;
  setBookmarks(bookmarks: BookmarkItem[]): void;
  movePage(activeId: string, overId: string): void;
  rotate(ids: string[], delta: number): void;
  remove(ids: string[]): void;
  duplicate(ids: string[]): void;
  keepOnly(ids: string[]): void;
  undo(): void;
  redo(): void;
  reset(): void;

  select(id: string, mode: SelectMode): void;
  setSelection(ids: string[]): void;

  setOutputName(name: string): void;
  setDocInfo(info: DocInfo | null): void;
  setBusy(message: string | null): void;
  setNotice(notice: Notice | null): void;
}

const HISTORY_LIMIT = 50;

function pagesFor(file: SourceFile): PageItem[] {
  return Array.from({ length: file.pageCount }, (_, pageIndex) => ({
    id: uid(),
    fileId: file.id,
    pageIndex,
    rotation: 0,
  }));
}

/** A loaded file's own bookmarks, pointed at its pages in the workspace. */
function bookmarksFor(file: SourceFile, pages: PageItem[]): BookmarkItem[] {
  return (file.outline ?? []).flatMap((b) => {
    const page = pages[b.pageIndex];
    return page ? [{ id: uid(), title: b.title, pageId: page.id, level: b.level }] : [];
  });
}

/** Drops files no page refers to, so history doesn't pin unrelated documents in pdf.js. */
function syncOpenDocuments(pages: PageItem[]): void {
  closeUnusedPdfs(new Set(pages.map((p) => p.fileId)));
}

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  /** Applies a change to files/pages as one undoable step. */
  const commit = (next: Partial<Snapshot>) => {
    const { files, pages, bookmarks, past, selection } = get();
    const nextPages = next.pages ?? pages;
    const alive = new Set(nextPages.map((p) => p.id));
    set({
      files: next.files ?? files,
      pages: nextPages,
      // Bookmarks to deleted pages go with them (and come back on undo).
      bookmarks: (next.bookmarks ?? bookmarks).filter((b) => alive.has(b.pageId)),
      past: [...past, { files, pages, bookmarks }].slice(-HISTORY_LIMIT),
      future: [],
      selection: selection.filter((id) => alive.has(id)),
    });
    syncOpenDocuments(nextPages);
  };

  const idSet = (ids: string[]) => new Set(ids);

  /** Restores a history entry, keeping only selected pages that still exist in it. */
  const restore = (snapshot: Snapshot, past: Snapshot[], future: Snapshot[]) => {
    const alive = new Set(snapshot.pages.map((p) => p.id));
    set({
      ...snapshot,
      past,
      future,
      selection: get().selection.filter((id) => alive.has(id)),
    });
    syncOpenDocuments(snapshot.pages);
  };

  return {
    files: {},
    pages: [],
    bookmarks: [],
    selection: [],
    anchor: null,
    past: [],
    future: [],
    outputName: "document.pdf",
    docInfo: emptyDocInfo,
    busy: null,
    notice: null,

    addFiles(added) {
      if (added.length === 0) return;
      const { files, pages } = get();
      if (pages.length === 0) {
        const first = added[0]!.name.replace(/\.[^.]+$/, "");
        set({
          outputName: `${first}${added.length > 1 ? "-merged" : ""}.pdf`,
          docInfo: added[0]!.info ?? emptyDocInfo,
        });
      }
      const nextFiles = { ...files };
      const newPages: PageItem[] = [];
      const newBookmarks: BookmarkItem[] = [];
      for (const f of added) {
        nextFiles[f.id] = f;
        const filePages = pagesFor(f);
        newPages.push(...filePages);
        newBookmarks.push(...bookmarksFor(f, filePages));
      }
      commit({
        files: nextFiles,
        pages: [...pages, ...newPages],
        bookmarks: [...get().bookmarks, ...newBookmarks],
      });
    },

    insertFiles(added, at) {
      if (added.length === 0) return;
      const { files, pages } = get();
      if (pages.length === 0) return get().addFiles(added);
      const nextFiles = { ...files };
      for (const f of added) nextFiles[f.id] = f;
      const inserted: PageItem[] = [];
      const newBookmarks: BookmarkItem[] = [];
      for (const f of added) {
        const filePages = pagesFor(f);
        inserted.push(...filePages);
        newBookmarks.push(...bookmarksFor(f, filePages));
      }
      const index = Math.max(0, Math.min(at, pages.length));
      commit({
        files: nextFiles,
        pages: [...pages.slice(0, index), ...inserted, ...pages.slice(index)],
        bookmarks: [...get().bookmarks, ...newBookmarks],
      });
      set({ selection: inserted.map((p) => p.id), anchor: inserted[0]?.id ?? null });
    },

    replaceDocument(file) {
      // The new file carries the bookmarks that were written into it.
      const pages = pagesFor(file);
      commit({
        files: { ...get().files, [file.id]: file },
        pages,
        bookmarks: bookmarksFor(file, pages),
      });
      set({ selection: [], anchor: null });
    },

    setPages(pages) {
      commit({ pages });
    },

    setBookmarks(bookmarks) {
      commit({ bookmarks });
    },

    movePage(activeId, overId) {
      const pages = [...get().pages];
      const from = pages.findIndex((p) => p.id === activeId);
      const to = pages.findIndex((p) => p.id === overId);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved!);
      commit({ pages });
    },

    rotate(ids, delta) {
      const targets = idSet(ids);
      commit({
        pages: get().pages.map((p) =>
          targets.has(p.id) ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p,
        ),
      });
    },

    remove(ids) {
      const targets = idSet(ids);
      commit({ pages: get().pages.filter((p) => !targets.has(p.id)) });
    },

    duplicate(ids) {
      const targets = idSet(ids);
      commit({
        pages: get().pages.flatMap((p) => (targets.has(p.id) ? [p, { ...p, id: uid() }] : [p])),
      });
    },

    keepOnly(ids) {
      const targets = idSet(ids);
      commit({ pages: get().pages.filter((p) => targets.has(p.id)) });
    },

    undo() {
      const { past, future, files, pages, bookmarks } = get();
      const prev = past.at(-1);
      if (!prev) return;
      restore(prev, past.slice(0, -1), [{ files, pages, bookmarks }, ...future]);
    },

    redo() {
      const { past, future, files, pages, bookmarks } = get();
      const next = future[0];
      if (!next) return;
      restore(next, [...past, { files, pages, bookmarks }], future.slice(1));
    },

    reset() {
      set({
        files: {},
        pages: [],
        bookmarks: [],
        selection: [],
        anchor: null,
        past: [],
        future: [],
        docInfo: emptyDocInfo,
      });
      syncOpenDocuments([]);
    },

    select(id, mode) {
      const { selection, anchor, pages } = get();
      if (mode === "toggle") {
        set({
          selection: selection.includes(id)
            ? selection.filter((s) => s !== id)
            : [...selection, id],
          anchor: id,
        });
      } else if (mode === "range" && anchor) {
        const a = pages.findIndex((p) => p.id === anchor);
        const b = pages.findIndex((p) => p.id === id);
        if (a < 0 || b < 0) return set({ selection: [id], anchor: id });
        const [lo, hi] = a < b ? [a, b] : [b, a];
        set({ selection: pages.slice(lo, hi + 1).map((p) => p.id) });
      } else {
        set({ selection: [id], anchor: id });
      }
    },

    setSelection(ids) {
      set({ selection: ids, anchor: ids[0] ?? null });
    },

    setOutputName(outputName) {
      set({ outputName });
    },

    setDocInfo(docInfo) {
      set({ docInfo });
    },

    setBusy(busy) {
      set({ busy });
    },

    setNotice(notice) {
      set({ notice });
    },
  };
});

/** Selected pages in document order (selection itself is in click order). */
export function selectedPages(state: Pick<WorkspaceState, "pages" | "selection">): PageItem[] {
  const ids = new Set(state.selection);
  return state.pages.filter((p) => ids.has(p.id));
}
