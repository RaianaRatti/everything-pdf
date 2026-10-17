import * as Comlink from "comlink";
import type { EngineApi } from "../workers/engine.worker";

/** All heavy PDF work runs in this worker so the page stays responsive. */
export const engine = Comlink.wrap<EngineApi>(
  new Worker(new URL("../workers/engine.worker.ts", import.meta.url), { type: "module" }),
);
