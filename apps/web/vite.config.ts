import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** All files under a directory, as URL paths. */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path, root) : [`/${relative(root, path)}`];
  });
}

/**
 * Emits sw.js with the complete list of built files, so the whole app (including lazily loaded
 * tools, pdf.js and qpdf's WebAssembly) works offline after the first visit.
 */
function serviceWorker(): Plugin {
  let publicDir = "";
  return {
    name: "everything-pdf:service-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => !file.endsWith(".map"))
        .map((file) => `/${file}`);
      const files = [...new Set([...built, ...listFiles(publicDir)])].sort();
      const version = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const source = readFileSync(new URL("./service-worker.js", import.meta.url), "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(files, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  worker: { format: "es" },
});
