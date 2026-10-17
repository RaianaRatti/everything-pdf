import { useEffect } from "react";
import { Link, NavLink, Navigate, useParams } from "react-router";
import { Dropzone } from "../components/Dropzone";
import { BusyOverlay, NoticeToast, PasswordDialog, WindowDropTarget } from "../components/Overlays";
import { PageGrid } from "../components/PageGrid";
import { WorkspaceBar } from "../components/WorkspaceBar";
import { addFiles, downloadDocument } from "../lib/actions";
import { useWorkspace } from "../store/workspace";
import { panels } from "../tools/panels";
import { findTool, tools, type Tool } from "../tools/registry";

export function Workspace() {
  const { toolId = "organize" } = useParams();
  const tool = findTool(toolId);
  return tool?.inWorkspace ? <ToolWorkspace tool={tool} /> : <Navigate to="/" replace />;
}

function ToolWorkspace({ tool }: { tool: Tool }) {
  const hasPages = useWorkspace((s) => s.pages.length > 0);
  useWorkspaceShortcuts(hasPages);
  useLeaveWarning(hasPages);

  useEffect(() => {
    document.title = `${tool.name} · everything-pdf`;
  }, [tool]);

  const Panel = panels[tool.id]!;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <ToolTabs active={tool} />
      {hasPages ? (
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <main className="flex-1 lg:min-h-0 lg:overflow-auto">
            <WorkspaceBar />
            <PageGrid />
          </main>
          <aside
            aria-label={`${tool.name} options`}
            className="shrink-0 border-t-2 border-ink lg:w-80 lg:overflow-auto lg:border-t-0 lg:border-l-2"
          >
            <Panel />
          </aside>
          <WindowDropTarget onFiles={(f) => void addFiles(f)} />
        </div>
      ) : (
        <main className="flex-1 overflow-auto p-4 sm:p-8">
          <div className="mx-auto max-w-2xl pt-4 sm:pt-16">
            <Dropzone
              onFiles={(f) => void addFiles(f)}
              accept="application/pdf,.pdf,image/*"
              title="drop PDF here"
              subtitle={tool.description}
            />
          </div>
        </main>
      )}
      <BusyOverlay />
      <PasswordDialog />
      <NoticeToast />
    </div>
  );
}

function ToolTabs({ active }: { active: Tool }) {
  return (
    <nav
      aria-label="Tools"
      className="flex shrink-0 gap-2 overflow-x-auto border-b-2 border-ink p-2"
    >
      <Link
        to="/"
        aria-label="All tools"
        className="shrink-0 border-2 border-transparent px-3 py-1.5 hover:border-ink"
      >
        ←
      </Link>
      {tools
        .filter((t) => t.category === active.category)
        .map((t) => (
          <NavLink
            key={t.id}
            to={`/${t.id}`}
            className={`shrink-0 border-2 px-3 py-1.5 text-sm whitespace-nowrap ${
              t.id === active.id
                ? "border-ink bg-ink text-paper"
                : "border-transparent hover:border-ink"
            }`}
          >
            {t.label}
          </NavLink>
        ))}
    </nav>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function useWorkspaceShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      const ws = useWorkspace.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) ws.redo();
        else ws.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        ws.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        ws.setSelection(ws.pages.map((p) => p.id));
      } else if (mod && key === "s") {
        e.preventDefault();
        void downloadDocument();
      } else if (mod && key === "d" && ws.selection.length) {
        e.preventDefault();
        ws.duplicate(ws.selection);
      } else if (!mod && (e.key === "[" || e.key === "]") && ws.selection.length) {
        e.preventDefault();
        ws.rotate(ws.selection, e.key === "]" ? 90 : -90);
      } else if ((e.key === "Delete" || e.key === "Backspace") && ws.selection.length) {
        e.preventDefault();
        ws.remove(ws.selection);
      } else if (e.key === "Escape") {
        ws.setSelection([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Work lives only in memory, so warn before the tab is closed with pages open. */
function useLeaveWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);
}
