import { Command, CornerDownLeft, Keyboard, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { downloadDocument } from "../lib/actions";
import { useWorkspace } from "../store/workspace";
import { searchTools } from "../tools/registry";

interface Entry {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  run: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const SHORTCUTS: [keys: string, action: string][] = [
  [`${MOD} K`, "Open the command palette"],
  [`${MOD} Z`, "Undo"],
  [`${MOD} ⇧ Z`, "Redo"],
  [`${MOD} A`, "Select all pages"],
  [`${MOD} S`, "Download"],
  [`${MOD} D`, "Duplicate selected pages"],
  ["Delete", "Delete selected pages"],
  ["[  ]", "Rotate selected pages left / right"],
  ["Esc", "Clear the selection"],
  ["?", "Show keyboard shortcuts"],
];

export function Palette({ onClose, onShowHelp }: { onClose: () => void; onShowHelp: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hasPages = useWorkspace((s) => s.pages.length > 0);
  const list = useRef<HTMLUListElement>(null);

  const entries = useMemo(() => {
    const ws = useWorkspace.getState();
    const actions: Entry[] =
      hasPages && pathname !== "/" && pathname !== "/batch" && pathname !== "/images-to-pdf"
        ? [
            {
              id: "download",
              label: "Download",
              hint: `${MOD} S`,
              run: () => void downloadDocument(),
            },
            { id: "undo", label: "Undo", hint: `${MOD} Z`, run: ws.undo },
            { id: "redo", label: "Redo", hint: `${MOD} ⇧ Z`, run: ws.redo },
            {
              id: "select-all",
              label: "Select all pages",
              hint: `${MOD} A`,
              run: () => ws.setSelection(ws.pages.map((p) => p.id)),
            },
            {
              id: "start-over",
              label: "Close all files and start over",
              run: () => confirm("Close all files and start over?") && ws.reset(),
            },
          ]
        : [];
    const words = query.toLowerCase().trim();
    const matchingActions = actions.filter((a) => a.label.toLowerCase().includes(words));
    const toolEntries: Entry[] = searchTools(query).map((t) => ({
      id: t.id,
      label: t.name,
      hint: t.category.toLowerCase(),
      icon: t.icon,
      run: () => void navigate(`/${t.id}`),
    }));
    const extras: Entry[] = "keyboard shortcuts help".includes(words)
      ? [
          {
            id: "shortcuts",
            label: "Keyboard shortcuts",
            hint: "?",
            icon: Keyboard,
            run: onShowHelp,
          },
        ]
      : [];
    return [...matchingActions, ...toolEntries, ...extras];
  }, [query, hasPages, pathname, navigate, onShowHelp]);

  const selected = Math.min(active, Math.max(0, entries.length - 1));

  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg border-2 border-ink bg-card"
      >
        <div className="flex items-center gap-2 border-b-2 border-ink px-3">
          <Command className="size-4 shrink-0" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={
              entries[selected] ? `palette-${entries[selected].id}` : undefined
            }
            placeholder="Search tools and actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(selected + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(selected - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(entries[selected]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            className="w-full bg-transparent py-3 text-base outline-none"
          />
        </div>
        <ul id="palette-list" ref={list} role="listbox" className="max-h-[55vh] overflow-auto p-1">
          {entries.length === 0 && <li className="p-3 text-sm text-ink-3">Nothing matches.</li>}
          {entries.map((entry, i) => {
            const Icon = entry.icon;
            return (
              <li
                key={entry.id}
                id={`palette-${entry.id}`}
                data-index={i}
                role="option"
                aria-selected={i === selected}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(entry)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${
                  i === selected ? "bg-ink text-paper" : ""
                }`}
              >
                {Icon ? (
                  <Icon className="size-4 shrink-0" aria-hidden />
                ) : (
                  <span className="size-4" />
                )}
                <span className="flex-1">{entry.label}</span>
                {entry.hint && (
                  <span className={`text-xs ${i === selected ? "text-paper" : "text-ink-3"}`}>
                    {entry.hint}
                  </span>
                )}
                {i === selected && <CornerDownLeft className="size-3.5" aria-hidden />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-sm border-2 border-ink bg-card p-5"
      >
        <p id="shortcuts-title" className="mb-3 text-lg">
          keyboard shortcuts
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action} className="contents">
              <dt>
                <kbd className="border-2 border-ink px-1.5 py-0.5 text-xs whitespace-nowrap">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-ink-2">{action}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-4 w-full border-2 border-ink px-3 py-2 text-sm hover:bg-ink hover:text-paper"
        >
          Close
        </button>
      </div>
    </div>
  );
}
