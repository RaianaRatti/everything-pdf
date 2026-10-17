import {
  ChevronDown,
  ChevronUp,
  ListIndentDecrease,
  ListIndentIncrease,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button, Hint, PanelSection, inputClass } from "../../components/ui";
import { uid } from "../../lib/files";
import { selectedPages, useWorkspace, type BookmarkItem } from "../../store/workspace";

export function BookmarksPanel() {
  const pages = useWorkspace((s) => s.pages);
  const selection = useWorkspace((s) => s.selection);
  const bookmarks = useWorkspace((s) => s.bookmarks);
  const { setBookmarks, setSelection } = useWorkspace.getState();
  const number = new Map(pages.map((p, i) => [p.id, i + 1]));
  const target = selectedPages({ pages, selection })[0] ?? pages[0];

  const update = (index: number, patch: Partial<BookmarkItem>) =>
    setBookmarks(bookmarks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const move = (index: number, delta: number) => {
    const next = [...bookmarks];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setBookmarks(next);
  };
  const add = () => {
    if (!target) return;
    const n = number.get(target.id)!;
    // Insert it in page order.
    const at = bookmarks.findIndex((b) => (number.get(b.pageId) ?? 0) > n);
    const item: BookmarkItem = { id: uid(), title: `Page ${n}`, pageId: target.id, level: 0 };
    const next = [...bookmarks];
    next.splice(at < 0 ? next.length : at, 0, item);
    setBookmarks(next);
  };

  return (
    <>
      <PanelSection>
        <Button variant="primary" className="w-full" disabled={!target} onClick={add}>
          <Plus className="size-4" /> Bookmark page {target ? number.get(target.id) : ""}
        </Button>
        <Hint>
          Bookmarks are the clickable table of contents PDF readers show in their sidebar. They
          follow their page when you reorder, and are saved with your download.
        </Hint>
      </PanelSection>
      <PanelSection title={bookmarks.length ? `${bookmarks.length} bookmarks` : "No bookmarks yet"}>
        <ol className="space-y-1.5">
          {bookmarks.map((b, i) => (
            <li
              key={b.id}
              className="flex items-center gap-1"
              style={{ paddingLeft: `${Math.min(b.level, 6) * 14}px` }}
            >
              <TitleInput value={b.title} onCommit={(title) => update(i, { title })} />
              <button
                type="button"
                title="Select this page"
                onClick={() => setSelection([b.pageId])}
                className="w-9 shrink-0 text-right text-xs text-ink-2 hover:text-ink"
              >
                p.{number.get(b.pageId)}
              </button>
              <IconButton
                label="Outdent"
                disabled={b.level === 0}
                onClick={() => update(i, { level: b.level - 1 })}
              >
                <ListIndentDecrease className="size-3.5" />
              </IconButton>
              <IconButton
                label="Indent"
                disabled={i === 0 || b.level > bookmarks[i - 1]!.level}
                onClick={() => update(i, { level: b.level + 1 })}
              >
                <ListIndentIncrease className="size-3.5" />
              </IconButton>
              <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <ChevronUp className="size-3.5" />
              </IconButton>
              <IconButton
                label="Move down"
                disabled={i === bookmarks.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="size-3.5" />
              </IconButton>
              <IconButton
                label="Remove"
                onClick={() => setBookmarks(bookmarks.filter((x) => x.id !== b.id))}
              >
                <X className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ol>
      </PanelSection>
    </>
  );
}

/** Edits locally and saves on blur/Enter, so typing isn't one undo step per keystroke. */
function TitleInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft.trim() || "Untitled");
    setDraft(null);
  };
  return (
    <input
      aria-label="Bookmark title"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`${inputClass} min-w-0 flex-1 px-2 py-1`}
    />
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 border-2 border-transparent p-0.5 hover:border-ink disabled:opacity-30 disabled:hover:border-transparent"
    >
      {children}
    </button>
  );
}
