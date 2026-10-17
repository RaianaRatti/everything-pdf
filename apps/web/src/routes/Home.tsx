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
      <header className="border-b-2 border-ink px-5 py-4 sm:px-8">
        <span className="text-lg">everything-pdf</span>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8 sm:py-16">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (results?.[0]) void navigate(`/${results[0].id}`);
          }}
          className="flex items-center gap-3 border-2 border-ink px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink"
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
              <p className="text-ink-3">no tool matches “{query}”.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                className="mb-4 flex items-center gap-3 text-sm text-ink-3 lowercase"
              >
                {category}
                <span className="h-0.5 flex-1 bg-ink" aria-hidden />
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      className="group flex h-28 flex-col justify-between border-2 border-ink p-3 hover:bg-ink hover:text-paper focus-visible:bg-ink focus-visible:text-paper focus-visible:outline-none"
    >
      <span className="flex items-start justify-between text-xs text-ink-3 group-hover:text-paper group-focus-visible:text-paper">
        {String(index + 1).padStart(2, "0")}
        <Icon
          className="size-6 text-ink group-hover:text-paper group-focus-visible:text-paper"
          aria-hidden
        />
      </span>
      <span className="flex items-center justify-between gap-2 text-lg leading-tight">
        {tool.label}
        <span
          className="text-xs opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        >
          ▶
        </span>
      </span>
    </Link>
  );
}
