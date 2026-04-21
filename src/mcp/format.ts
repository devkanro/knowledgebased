import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { QUERY_OUTPUT_SUBDIR } from "../constants.js";
import type { FragmentResult } from "../types.js";

/** Render a list of fragment results as a single markdown blob. */
export function formatFull(results: FragmentResult[]): string {
  return results
    .map((r) => {
      const header = `## ${r.path}`;
      const refs = r.refs.length > 0 ? "\nRefs: " + r.refs.join(", ") : "";
      const sourceLine = r.source && r.source !== "repo" ? `\nSource: ${r.source}` : "";
      const meta = `Tags: ${r.tags.join(", ")}${refs}${sourceLine}`;
      return `${header}\n${meta}\n\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Spill a query response to disk under `<rootDir>/.copilot/knowledge-queries/`
 * and return the (forward-slashed) absolute path.
 */
export function writeQueryOutput<T>(rootDir: string, payload: T, render: (v: T) => string): string {
  const dir = join(rootDir, QUERY_OUTPUT_SUBDIR);
  mkdirSync(dir, { recursive: true });
  const filename = `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, render(payload), "utf-8");
  return filePath.replace(/\\/g, "/");
}
