import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

import { CACHE_ROOT, EMBEDDING_CACHE_VERSION, EMBEDDING_DIM, EMBEDDING_MODEL } from "../constants.js";
import type { EmbeddingCacheFile, EmbeddingCacheEntry } from "../types.js";

/**
 * Cache directory derived from a stable hash of the canonical knowledge path.
 */
export function resolveCacheDir(knowledgeDir: string, override?: string): string {
  if (override) return override;
  const hash = createHash("md5").update(knowledgeDir).digest("hex").slice(0, 12);
  return join(CACHE_ROOT, hash);
}

/** Compute the deterministic hash for a fragment's embedding payload. */
export function fragmentHash(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

/**
 * Load cache from disk. Returns null when the file is missing,
 * unreadable, or has an incompatible version/model/dim.
 */
export function loadCache(cacheDir: string): Record<string, EmbeddingCacheEntry> | null {
  const cachePath = join(cacheDir, "embeddings.json");
  if (!existsSync(cachePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as EmbeddingCacheFile;
    if (
      raw.version !== EMBEDDING_CACHE_VERSION ||
      raw.model !== EMBEDDING_MODEL ||
      raw.dim !== EMBEDDING_DIM
    ) {
      return null;
    }
    return raw.fragments;
  } catch {
    return null;
  }
}

/** Persist cache atomically (best-effort: createDir + write). */
export function saveCache(cacheDir: string, fragments: Record<string, EmbeddingCacheEntry>): void {
  mkdirSync(cacheDir, { recursive: true });
  const data: EmbeddingCacheFile = {
    version: EMBEDDING_CACHE_VERSION,
    model: EMBEDDING_MODEL,
    dim: EMBEDDING_DIM,
    fragments,
  };
  writeFileSync(join(cacheDir, "embeddings.json"), JSON.stringify(data), "utf-8");
}
