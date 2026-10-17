import { Suspense, lazy, useEffect, useState } from "react";

// The dialogs pull in workspace actions (and with them pdf.js and the engine worker), so they
// load on first use instead of with every page.
const Palette = lazy(() => import("./PaletteDialogs").then((m) => ({ default: m.Palette })));
const ShortcutsDialog = lazy(() =>
  import("./PaletteDialogs").then((m) => ({ default: m.ShortcutsDialog })),
);

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** ⌘K / Ctrl+K anywhere: jump to a tool or run a workspace action. "?" lists shortcuts. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHelp(false);
        setOpen((o) => !o);
      } else if (e.key === "?" && !isTyping(e.target) && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Suspense fallback={null}>
      {open && (
        <Palette
          onClose={() => setOpen(false)}
          onShowHelp={() => {
            setOpen(false);
            setHelp(true);
          }}
        />
      )}
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
    </Suspense>
  );
}
