import { readFileSync, existsSync } from "fs";
import { resolve, sep } from "path";

import { REPO_SOURCE_ALIAS } from "../constants.js";
import type { Fragment, ResolvedSource } from "../types.js";
import { qualifyPath } from "./graph.js";

/**
 * Validate `refs` (source code references like `src/foo.ts::symbolName`)
 * against an on-disk projectRoot. Returns warning strings (one per problem).
 */
export function validateRefs(refs: string[], projectRoot: string): string[] {
  const warnings: string[] = [];

  for (const ref of refs) {
    if (typeof ref !== "string") continue;

    const [filePath, ...symbols] = ref.split("::");
    const absPath = resolve(projectRoot, filePath);

    if (!absPath.startsWith(projectRoot + sep)) {
      warnings.push(`⚠️ ref: ${ref} — path escapes project root`);
      continue;
    }

    if (!existsSync(absPath)) {
      warnings.push(`⚠️ ref: ${ref} — file not found: ${filePath}`);
      continue;
    }

    if (symbols.length === 0) continue;

    let content: string;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch {
      warnings.push(`⚠️ ref: ${ref} — could not read file: ${filePath}`);
      continue;
    }

    for (const symbol of symbols) {
      if (!content.includes(symbol)) {
        warnings.push(`⚠️ ref: ${ref} — "${symbol}" not found in ${filePath}`);
      }
    }
  }

  return warnings;
}

/**
 * Validate that every entry in `related` resolves to a known fragment
 * within the same source. Cross-source references (containing `@`) are forbidden.
 *
 * @param related     Raw related-link values from frontmatter
 * @param fragments   Map of known fragment paths (qualified)
 * @param source      The source this fragment belongs to (for same-source resolution)
 */
export function validateRelated(
  related: string[],
  fragments: Map<string, Fragment>,
  source?: ResolvedSource,
): string[] {
  const warnings: string[] = [];
  const alias = source?.alias ?? REPO_SOURCE_ALIAS;

  for (const rel of related) {
    if (rel.includes("@")) {
      warnings.push(`⚠️ related: "${rel}" — cross-source references (containing @) are forbidden`);
      continue;
    }
    const withExt = rel.endsWith(".md") ? rel : rel + ".md";
    const qualifiedPath = qualifyPath(alias, withExt);
    if (!fragments.has(qualifiedPath)) {
      warnings.push(`⚠️ related: ${rel} — fragment not found`);
    }
  }
  return warnings;
}
