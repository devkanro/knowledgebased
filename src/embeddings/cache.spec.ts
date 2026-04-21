import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { fragmentHash, loadCache, resolveCacheDir, saveCache } from "./cache.js";
import { CACHE_ROOT, EMBEDDING_CACHE_VERSION, EMBEDDING_DIM, EMBEDDING_MODEL } from "../constants.js";

test("resolveCacheDir: respects explicit override", () => {
  assert.equal(resolveCacheDir("/any/path", "/custom/dir"), "/custom/dir");
});

test("resolveCacheDir: defaults to CACHE_ROOT/<hash>", () => {
  const dir = resolveCacheDir("/some/knowledge");
  assert.ok(dir.startsWith(CACHE_ROOT));
  assert.equal(dir.length, CACHE_ROOT.length + 1 + 12);
});

test("resolveCacheDir: stable for same input", () => {
  assert.equal(resolveCacheDir("/abc"), resolveCacheDir("/abc"));
});

test("fragmentHash: deterministic and content-sensitive", () => {
  assert.equal(fragmentHash("hello"), fragmentHash("hello"));
  assert.notEqual(fragmentHash("hello"), fragmentHash("world"));
});

test("loadCache + saveCache: roundtrips embeddings", () => {
  const dir = mkdtempSync(join(tmpdir(), "kmcp-cache-"));
  try {
    const fragments = {
      "a.md": { hash: "h1", embedding: [0.1, 0.2, 0.3] },
      "b.md": { hash: "h2", embedding: [0.4, 0.5] },
    };
    saveCache(dir, fragments);
    const loaded = loadCache(dir);
    assert.deepEqual(loaded, fragments);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadCache: returns null for missing dir", () => {
  assert.equal(loadCache("/nonexistent/cache/dir/12345"), null);
});

test("loadCache: returns null when version/model/dim mismatch", () => {
  const dir = mkdtempSync(join(tmpdir(), "kmcp-cache-"));
  try {
    writeFileSync(
      join(dir, "embeddings.json"),
      JSON.stringify({
        version: EMBEDDING_CACHE_VERSION + 99,
        model: EMBEDDING_MODEL,
        dim: EMBEDDING_DIM,
        fragments: {},
      })
    );
    assert.equal(loadCache(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadCache: returns null for malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "kmcp-cache-"));
  try {
    writeFileSync(join(dir, "embeddings.json"), "{ bad");
    assert.equal(loadCache(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
