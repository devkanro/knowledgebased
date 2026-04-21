import matter from "gray-matter";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

import type { Fragment } from "../types.js";

/** Recursively list all files under `dir`. Returns absolute paths. Skips files with '@' in name. */
export function walkDir(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else {
        if (entry.name.includes("@")) {
          console.error(`⚠️ Ignoring file with '@' in name: ${fullPath}`);
          continue;
        }
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist yet — return empty
  }
  return results;
}

/** Extract the first H1 from markdown content. */
export function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "(untitled)";
}

/**
 * Parse a single fragment file. Returns null if file cannot be read/parsed.
 *
 * @param filePath  Absolute path to a .md file
 * @param baseDir   Knowledge root, used to compute the relative path key
 * @returns         { relPath, fragment } or null
 */
export function parseFragmentFile(
  filePath: string,
  baseDir: string
): { relPath: string; fragment: Fragment } | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch {
    return null;
  }

  const { data, content } = parsed;
  const relPath = relative(baseDir, filePath).replace(/\\/g, "/");

  const fragment: Fragment = {
    tags: (data.tags as string[]) || [],
    related: (data.related as string[]) || [],
    source: (data.source as string) || null,
    refs: (data.refs as string[]) || [],
    content: content.trim(),
    title: extractTitle(content),
  };

  return { relPath, fragment };
}
