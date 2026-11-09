import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { findTool } from "../tools/registry";

/**
 * The header every tool page shares: a back link to all tools, the tool's icon and name, and
 * optional controls on the right (like "start over").
 */
export function ToolHeader({ toolId, children }: { toolId: string; children?: ReactNode }) {
  const tool = findTool(toolId);
  const Icon = tool?.icon;
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-ink bg-card py-3 pr-14 pl-3 sm:pl-5">
      <Link to="/" className="rounded-md p-1.5 hover:bg-accent" aria-label="All tools">
        <ArrowLeft className="size-5" />
      </Link>
      {Icon && <Icon className="size-5" aria-hidden />}
      <h1 className="text-lg">{tool?.label ?? toolId}</h1>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </header>
  );
}
