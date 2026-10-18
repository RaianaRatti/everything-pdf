import { Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { categories, searchTools, tools, type Tool } from "../tools/registry";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Home() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const results = query.trim() ? searchTools(query) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2.5 border-b border-ink bg-card py-4 pr-14 pl-5 sm:pl-8">
        <svg viewBox="0 0 32 32" className="size-6 text-ink" aria-hidden>
          <path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M20 3v6h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M11 16h11M11 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-lg">everything-pdf</span>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-4xl leading-tight sm:text-5xl">everything-pdf</h1>

        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (results?.[0]) void navigate(`/${results[0].id}`);
          }}
          className="flex items-center gap-3 rounded-lg border-3 border-ink bg-card px-3 shadow-pop focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink"
        >
          <Search className="size-5 shrink-0" aria-hidden />
          <input
            type="search"
            aria-label="Search tools"
            placeholder="what do you want to do?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent py-3 text-lg outline-none placeholder:text-ink-3"
          />
          <kbd className="hidden shrink-0 text-xs text-ink-3 sm:inline">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </form>

        {results && (
          <section aria-label="Search results">
            {results.length === 0 ? (
              <p className="text-ink-3">no tool matches “{query}”</p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {results.map((tool) => (
                  <li key={tool.id}>
                    <ToolCard tool={tool} index={tools.indexOf(tool)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!results &&
          categories.map((category, c) => (
            <section key={category} aria-labelledby={`cat-${c}`}>
              <h2
                id={`cat-${c}`}
                className="mb-4 flex items-center gap-2.5 text-sm text-ink-2 lowercase"
              >
                <span className="size-2.5 rounded-full border-2 border-ink bg-accent" aria-hidden />
                {category}
                <span className="h-px flex-1 bg-ink" aria-hidden />
              </h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {tools
                  .filter((tool) => tool.category === category)
                  .map((tool) => (
                    <li key={tool.id}>
                      <ToolCard tool={tool} index={tools.indexOf(tool)} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
      </main>
    </div>
  );
}

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  const Icon = tool.icon;
  return (
    <Link
      to={`/${tool.id}`}
      title={tool.description}
      className="group pop-press flex h-32 flex-col justify-between rounded-lg border-3 border-ink bg-card p-3 shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-9 items-center justify-center rounded-md border-2 border-ink bg-accent">
          <Icon className="size-5 text-ink" aria-hidden />
        </span>
        <span className="text-xs text-ink-3">{String(index + 1).padStart(2, "0")}</span>
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
