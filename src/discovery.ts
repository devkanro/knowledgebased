import { existsSync, statSync, readFileSync } from "fs";
import { basename, join, dirname, resolve, sep } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

import { CACHE_ROOT, PROJECT_CONFIG_FILE, REPO_SOURCE_ALIAS, USER_GLOBAL_CONFIG_PATH } from "./constants.js";
import type { KnowledgeConfig, RawKnowledgeConfig, ResolvedSource } from "./types.js";

/** Internal resolved single-source result (not exported). */
interface DiscoveredSource {
  knowledgeDir: string;
  cacheDir?: string;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Discover all knowledge sources for the given starting directory.
 *
 * Returns the **union** of:
 *   - Phase 1: a project source (walk up from startDir)
 *   - Phase 2: matched external KBs from `~/.knowledgebased.json`
 *
 * Returns an empty array if nothing is found.
 */
export function discoverSources(
  startDir: string,
  userConfigPath: string = USER_GLOBAL_CONFIG_PATH,
): ResolvedSource[] {
  const sources: ResolvedSource[] = [];
  const seenIds = new Set<string>();

  // Phase 1: project source
  const projectConfig = discoverProjectSource(startDir);
  if (projectConfig) {
    const src = configToSource(projectConfig, REPO_SOURCE_ALIAS, "cwd");
    sources.push(src);
    seenIds.add(src.sourceId);
  }

  // Phase 2: user-global KB sources
  const globalSources = resolveGlobalSources(startDir, userConfigPath);
  for (const gs of globalSources) {
    if (seenIds.has(gs.sourceId)) {
      const existing = sources.find((s) => s.sourceId === gs.sourceId);
      throw new Error(
        `Duplicate knowledge directory: "${gs.knowledgeDir}" is declared as both ` +
          `"${existing?.alias}" and "${gs.alias}". Each knowledge base must point to a unique directory.`,
      );
    }
    seenIds.add(gs.sourceId);
    sources.push(gs);
  }

  if (sources.length === 0) {
    console.error("knowledgebased: no knowledge sources found for " + resolve(startDir));
  }

  return sources;
}

/**
 * Legacy single-source discovery (Phase 1 only + Phase 2 fallback).
 * Kept for backward compatibility with tests; prefer {@link discoverSources}.
 */
export function discoverKnowledge(
  startDir: string,
  userConfigPath: string = USER_GLOBAL_CONFIG_PATH,
): DiscoveredSource | null {
  const config = discoverProjectSource(startDir);
  if (config) return config;
  return tryConfigFile(userConfigPath, homedir());
}

// ─── Phase 1: project source ────────────────────────────────────

/**
 * Walk up from `startDir` looking for a project-level knowledge source.
 * At each ancestor, try (in priority order):
 *   1. `.knowledge.json`    — always checked (explicit intent)
 *   2. `knowledge/`         — only within git root (or if no git root found)
 *   3. `.knowledge/`        — only within git root (or if no git root found)
 *   4. sibling `<basename>.knowledge/` — always checked (explicit naming)
 *
 * Beyond the git root boundary, only patterns ① and ④ are tried,
 * since `knowledge/` and `.knowledge/` are too generic to match
 * outside the project tree. If no git root is found, all patterns
 * are tried at every level (fallback for non-git directories).
 */
function discoverProjectSource(startDir: string): DiscoveredSource | null {
  let current = resolve(startDir);
  const gitRoot = findGitRoot(current);

  while (true) {
    // Beyond git root: only try explicit patterns (config + sibling)
    const beyondGitRoot = gitRoot !== null && !isPathPrefixOrEqual(gitRoot, current);

    const found =
      tryConfigFile(join(current, PROJECT_CONFIG_FILE), current) ??
      (beyondGitRoot ? null : tryDirectory(join(current, "knowledge"))) ??
      (beyondGitRoot ? null : tryDirectory(join(current, ".knowledge"))) ??
      trySiblingSuffix(current);

    if (found) return found;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/** Find the nearest .git directory walking up from startDir. Returns null if none found. */
function findGitRoot(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Check if `prefix` is equal to or a parent of `target` (segment-boundary aware). */
function isPathPrefixOrEqual(prefix: string, target: string): boolean {
  const canonPrefix = canonPath(prefix);
  const canonTarget = canonPath(target);
  return canonPrefix === canonTarget || isPathPrefix(canonPrefix, canonTarget);
}

// ─── Phase 2: user-global config ────────────────────────────────

/**
 * Parse `~/.knowledgebased.json`, match the current cwd against `repos`
 * entries, and return resolved external KB sources.
 */
function resolveGlobalSources(cwd: string, configPath: string): ResolvedSource[] {
  if (!existsSync(configPath)) return [];

  let raw: RawKnowledgeConfig;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8")) as RawKnowledgeConfig;
  } catch {
    return [];
  }

  const bases = raw.bases ?? {};
  const repos = raw.repos ?? {};
  const configDir = dirname(resolve(configPath));

  // Validate base IDs
  for (const id of Object.keys(bases)) {
    validateBaseId(id);
  }

  // Validate repos references
  for (const [, kbIds] of Object.entries(repos)) {
    for (const id of kbIds) {
      if (!bases[id]) {
        throw new Error(
          `~/.knowledgebased.json: repos references unknown base "${id}". ` +
            `Defined bases: ${Object.keys(bases).join(", ") || "(none)"}`,
        );
      }
    }
  }

  // Collect matched KB ids: wildcard "*" + longest-prefix-matching entry
  const matchedIds = new Set<string>();
  const canonCwd = canonPath(cwd);

  // Always include wildcard
  if (repos["*"]) {
    for (const id of repos["*"]) matchedIds.add(id);
  }

  // Find the longest-prefix match among non-wildcard entries
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const repoKey of Object.keys(repos)) {
    if (repoKey === "*") continue;
    const canonKey = canonPath(repoKey);
    if (isPathPrefix(canonKey, canonCwd) && canonKey.length > bestLen) {
      bestKey = repoKey;
      bestLen = canonKey.length;
    }
  }
  if (bestKey && repos[bestKey]) {
    for (const id of repos[bestKey]) matchedIds.add(id);
  }

  // Resolve matched bases to ResolvedSource[]
  const results: ResolvedSource[] = [];
  for (const id of matchedIds) {
    const entry = bases[id];
    if (!entry) continue;

    const { knowledgeDir, cacheDir } = resolveBaseEntry(entry, configDir);
    if (!existsSync(knowledgeDir) || !statSync(knowledgeDir).isDirectory()) continue;

    results.push({
      sourceId: computeSourceId(knowledgeDir),
      alias: id,
      knowledgeDir,
      cacheDir: cacheDir ?? join(CACHE_ROOT, computeSourceId(knowledgeDir)),
      refScope: "unscoped",
    });
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────

function tryConfigFile(configPath: string, baseDir: string): DiscoveredSource | null {
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as KnowledgeConfig;
    const knowledgeDir = resolve(baseDir, config.knowledge || "knowledge");
    if (!existsSync(knowledgeDir) || !statSync(knowledgeDir).isDirectory()) return null;
    return {
      knowledgeDir,
      cacheDir: config.cacheDir ? resolve(baseDir, config.cacheDir) : undefined,
    };
  } catch {
    return null;
  }
}

function tryDirectory(path: string): DiscoveredSource | null {
  if (!existsSync(path) || !statSync(path).isDirectory()) return null;
  return { knowledgeDir: path };
}

function trySiblingSuffix(current: string): DiscoveredSource | null {
  const name = basename(current);
  if (!name) return null;
  return tryDirectory(join(dirname(current), `${name}.knowledge`));
}

/** Convert a DiscoveredSource into a ResolvedSource. */
function configToSource(config: DiscoveredSource, alias: string, refScope: "cwd" | "unscoped"): ResolvedSource {
  const sid = computeSourceId(config.knowledgeDir);
  return {
    sourceId: sid,
    alias,
    knowledgeDir: config.knowledgeDir,
    cacheDir: config.cacheDir ?? join(CACHE_ROOT, sid),
    refScope,
  };
}

/** Resolve a bases entry (string shorthand or KnowledgeConfig) relative to configDir. */
function resolveBaseEntry(
  entry: string | KnowledgeConfig,
  configDir: string,
): { knowledgeDir: string; cacheDir: string | undefined } {
  if (typeof entry === "string") {
    return { knowledgeDir: resolve(configDir, expandTilde(entry)), cacheDir: undefined };
  }
  const knowledge = entry.knowledge ?? "knowledge";
  return {
    knowledgeDir: resolve(configDir, expandTilde(knowledge)),
    cacheDir: entry.cacheDir ? resolve(configDir, expandTilde(entry.cacheDir)) : undefined,
  };
}

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p.startsWith("~\\") || p === "~") {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/** Canonical path for comparison: resolve + lowercase on Windows. */
function canonPath(p: string): string {
  const expanded = expandTilde(p);
  const resolved = resolve(expanded);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** Segment-boundary prefix check. */
function isPathPrefix(prefix: string, target: string): boolean {
  if (!target.startsWith(prefix)) return false;
  return (
    target.length === prefix.length ||
    target[prefix.length] === sep ||
    target[prefix.length] === "/" ||
    target[prefix.length] === "\\"
  );
}

function computeSourceId(knowledgeDir: string): string {
  return createHash("md5").update(knowledgeDir).digest("hex").slice(0, 12);
}

function validateBaseId(id: string): void {
  if (id === "*") throw new Error('Invalid base ID: "*" is reserved');
  if (id.includes("@")) throw new Error(`Invalid base ID "${id}": must not contain @`);
  if (id.includes("/")) throw new Error(`Invalid base ID "${id}": must not contain /`);
  if (id.includes(" ")) throw new Error(`Invalid base ID "${id}": must not contain spaces`);
}
