import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { categories, searchTools, tools, type Tool } from "../tools/registry";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const searching = query.trim() !== "";
  const results = searchTools(query);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2.5 border-b border-ink bg-card py-4 pr-14 pl-5 sm:pl-8">
        <Logo />
        <span className="text-lg">everything-pdf</span>
      </header>

      <section className="relative border-b border-ink">
        <Dither />
        <div className="relative mx-auto grid w-full max-w-4xl items-center gap-10 px-5 pt-12 pb-24 sm:px-8 sm:pt-16 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-4xl leading-tight sm:text-5xl">everything-pdf</h1>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
                {[`${tools.length} tools`, "files never leave your device", "works offline"].map(
                  (fact) => (
                    <li key={fact} className="flex items-center gap-2">
                      <span className="size-2 bg-accent" aria-hidden />
                      {fact}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (searching && results[0]) void navigate(`/${results[0].id}`);
              }}
              className="relative block max-w-md"
            >
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <input
                type="search"
                aria-label="Search tools"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="search tools: merge, sign, compress…"
                className="w-full rounded-md border-2 border-ink bg-card py-2.5 pr-16 pl-9 focus:outline-2 focus:outline-offset-2 focus:outline-ink [&::-webkit-search-cancel-button]:hidden"
              />
              {searching ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 text-xs text-ink-3 sm:inline">
                  {isMac ? "⌘" : "Ctrl"} K
                </kbd>
              )}
            </form>
          </div>
          <Viewer />
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-5 py-12 sm:px-8 sm:py-14">
        {searching ? (
          <section aria-label="Search results">
            {results.length ? (
              <ToolGrid list={results} />
            ) : (
              <p className="text-ink-2">No tool matches “{query.trim()}”. Try another word.</p>
            )}
          </section>
        ) : (
          categories.map((category, c) => {
            const list = tools.filter((tool) => tool.category === category);
            if (!list.length) return null;
            return (
              <section key={category} aria-labelledby={`cat-${c}`}>
                <h2
                  id={`cat-${c}`}
                  className="mb-4 flex items-center gap-2.5 text-sm text-ink-2 lowercase"
                >
                  <span className="size-2 bg-accent" aria-hidden />
                  {category}
                  <span className="h-px flex-1 bg-line" aria-hidden />
                </h2>
                <ToolGrid list={list} />
              </section>
            );
          })
        )}
      </main>

      <footer className="border-t border-ink bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-5 text-sm text-ink-3 sm:px-8">
          <span className="flex items-center gap-2.5 text-ink">
            <Logo />
            everything-pdf
          </span>
          <span>
            press <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd> anywhere to jump to a tool
          </span>
        </div>
      </footer>
    </div>
  );
}

/** A little pixel PDF viewer: just decoration, it doesn't do anything. */
function Viewer() {
  return (
    <div className="w-full max-w-md border-2 border-ink bg-card select-none">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-3 py-2 text-xs">
        <span className="truncate">untitled.pdf</span>
        <span className="flex shrink-0 gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 border-2 border-ink" />
          ))}
        </span>
      </div>
      <div className="relative flex aspect-video items-end justify-center gap-3 overflow-hidden bg-paper-2 px-6">
        <Page className="-mb-10 hidden w-1/4 -rotate-3 sm:block" lines={5} />
        <Page className="-mb-6 w-1/3" lines={7} highlight />
        <Page className="-mb-10 hidden w-1/4 rotate-3 sm:block" lines={4} />
        <div className="absolute inset-x-0 top-3 flex justify-center px-4">
          <p className="flex flex-col items-center gap-1 border-2 border-ink bg-card px-4 py-2.5 text-center">
            runs in your browser
            <span className="text-xs text-ink-3">merge · sign · compress · more</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t-2 border-ink px-3 py-2 text-xs" aria-hidden>
        <ChevronLeft className="size-3.5" />
        <span className="tabular-nums">2 / 3</span>
        <ChevronRight className="size-3.5" />
        <span className="flex-1" />
        <span className="text-ink-3 tabular-nums">100%</span>
      </div>
    </div>
  );
}

/** One page of the viewer: grey text lines, one of them being highlighted. */
function Page({
  lines,
  highlight = false,
  className = "",
}: {
  lines: number;
  highlight?: boolean;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-full", "w-3/5", "w-5/6", "w-2/3"];
  return (
    <div
      className={`aspect-[3/4] shrink-0 space-y-1.5 border-2 border-ink bg-card p-2 ${className}`}
    >
      <div className="mb-2.5 h-2 w-1/2 bg-ink" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`relative h-1 bg-paper-3 ${widths[i % widths.length]}`}>
          {highlight && i === 3 && (
            <span className="animate-sweep absolute inset-y-[-2px] left-0 bg-accent" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Pixel dither along the hero's bottom edge: 4px squares that thicken toward the border. */
function Dither() {
  // One 16px row per density: 1/8, 1/4, 1/2, 3/4.
  const rows = [
    [
      [0, 0],
      [8, 8],
    ],
    [
      [0, 0],
      [8, 0],
      [4, 8],
      [12, 8],
    ],
    [
      [0, 0],
      [8, 0],
      [4, 4],
      [12, 4],
      [0, 8],
      [8, 8],
      [4, 12],
      [12, 12],
    ],
    [
      [0, 0],
      [4, 0],
      [8, 0],
      [12, 0],
      [4, 4],
      [12, 4],
      [0, 8],
      [4, 8],
      [8, 8],
      [12, 8],
      [4, 12],
      [12, 12],
    ],
  ];
  return (
    <svg
      className="pixel pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-accent"
      aria-hidden
    >
      <defs>
        {rows.map((squares, i) => (
          <pattern key={i} id={`dither-${i}`} width="16" height="16" patternUnits="userSpaceOnUse">
            {squares.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" fill="currentColor" />
            ))}
          </pattern>
        ))}
      </defs>
      {rows.map((_, i) => (
        <rect key={i} y={i * 16} width="100%" height="16" fill={`url(#dither-${i})`} />
      ))}
    </svg>
  );
}

/** Tools are numbered in the order Home shows them by category, so numbers don't jump around. */
const numbered = categories.flatMap((c) => tools.filter((t) => t.category === c));

function ToolGrid({ list }: { list: Tool[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {list.map((tool) => (
        <li key={tool.id}>
          <ToolCard tool={tool} number={numbered.indexOf(tool) + 1} />
        </li>
      ))}
    </ul>
  );
}

function ToolCard({ tool, number }: { tool: Tool; number: number }) {
  const Icon = tool.icon;
  return (
    <Link
      to={`/${tool.id}`}
      title={tool.description}
      className="group pop-press flex h-32 flex-col justify-between rounded-lg border-2 border-ink bg-card p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-9 items-center justify-center rounded-md bg-accent group-hover:bg-ink group-focus-visible:bg-ink">
          <Icon
            className="size-5 text-ink group-hover:text-accent group-focus-visible:text-accent"
            aria-hidden
          />
        </span>
        <span className="text-xs text-ink-3">{String(number).padStart(2, "0")}</span>
      </span>
      <span className="flex items-center justify-between gap-2 text-lg leading-tight">
        {tool.label}
        <span
          className="text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        >
          ▶
        </span>
      </span>
    </Link>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="pixel size-6 shrink-0 text-ink" aria-hidden>
      <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <path d="M20 3v6h6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="13" width="13" height="6" fill="var(--color-accent)" />
      <path d="M11 16h11M11 21h8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
