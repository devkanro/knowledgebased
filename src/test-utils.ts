import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";

import { CACHE_ROOT, REPO_SOURCE_ALIAS } from "./constants.js";
import type { ResolvedSource } from "./types.js";

/**
 * Test helpers for setting up isolated knowledge-dir fixtures on disk.
 * Each fixture lives under a unique tmp dir; call cleanup() in `after`.
 */
export interface Fixture {
  root: string;
  knowledgeDir: string;
  /** Write a markdown fragment with frontmatter. Returns absolute path. */
  writeFragment(relPath: string, frontmatter: Record<string, unknown>, body: string): string;
  /** Write a plain file (e.g. source code, JSON config). */
  writeFile(relPath: string, content: string): string;
  /** Build a ResolvedSource for this fixture's knowledge dir. */
  toSource(alias?: string, refScope?: "cwd" | "unscoped"): ResolvedSource;
  cleanup(): void;
}

export function makeFixture(opts: { withKnowledgeDir?: boolean } = {}): Fixture {
  const { withKnowledgeDir = true } = opts;
  const root = mkdtempSync(join(tmpdir(), "knowledge-mcp-test-"));
  const knowledgeDir = join(root, "knowledge");
  if (withKnowledgeDir) mkdirSync(knowledgeDir, { recursive: true });

  return {
    root,
    knowledgeDir,
    writeFragment(relPath, frontmatter, body) {
      const abs = join(knowledgeDir, relPath);
      mkdirSync(join(abs, ".."), { recursive: true });
      const fm = Object.entries(frontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");
      writeFileSync(abs, `---\n${fm}\n---\n${body}`, "utf-8");
      return abs;
    },
    writeFile(relPath, content) {
      const abs = join(root, relPath);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, content, "utf-8");
      return abs;
    },
    toSource(alias = REPO_SOURCE_ALIAS, refScope: "cwd" | "unscoped" = "cwd") {
      const sid = createHash("md5").update(knowledgeDir).digest("hex").slice(0, 12);
      return {
        sourceId: sid,
        alias,
        knowledgeDir,
        cacheDir: join(CACHE_ROOT, sid),
        refScope,
      };
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Create a second fixture for an external KB source (convenience). */
export function makeExternalFixture(alias: string): Fixture {
  const fx = makeFixture();
  // Override toSource to default to unscoped
  const origToSource = fx.toSource.bind(fx);
  fx.toSource = (a = alias, r = "unscoped") => origToSource(a, r);
  return fx;
}
