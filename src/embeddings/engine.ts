import {
  DEFAULT_HYBRID_ALPHA,
  DEFAULT_SEMANTIC_THRESHOLD,
  DEFAULT_SEMANTIC_TOP_K,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
} from "../constants.js";
import type { KnowledgeGraph } from "../core/graph.js";
import type { EmbeddingCacheEntry, SemanticHit } from "../types.js";
import { BM25Engine } from "./bm25.js";
import { fragmentHash, loadCache, saveCache } from "./cache.js";

type EmbedderFn = (
  text: string,
  opts: { pooling: string; normalize: boolean }
) => Promise<{ data: ArrayLike<number> }>;

/**
 * Sentence-embedding engine backed by `@huggingface/transformers`.
 * Lazy-initializes the model and persists vectors to disk.
 *
 * Uses hybrid scoring: α × cosine + (1-α) × BM25 (normalized).
 *
 * Multi-source aware: loads/saves embedding caches per-source so
 * adding/removing a source doesn't invalidate other caches.
 */
export class EmbeddingEngine {
  private readonly graph: KnowledgeGraph;
  private readonly embeddings: Map<string, Float32Array> = new Map();
  private readonly bm25 = new BM25Engine();
  private embedder: EmbedderFn | null = null;
  private _initPromise: Promise<void> | null = null;
  private _rebuildQueued = false;
  private _rebuildRunning = false;

  constructor(graph: KnowledgeGraph) {
    this.graph = graph;
  }

  /** Kick off background init — call once at startup. */
  startInit(): void {
    this._initPromise = this._init().catch((e: Error) => {
      console.error("EmbeddingEngine init failed:", e.message);
      this._initPromise = null;
    });
  }

  async ensureReady(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this._init().catch((e: Error) => {
        console.error("EmbeddingEngine init failed:", e.message);
        this._initPromise = null;
        throw e;
      });
    }
    await this._initPromise;
  }

  private async _init(): Promise<void> {
    const { pipeline } = await import("@huggingface/transformers");
    this.embedder = (await pipeline("feature-extraction", EMBEDDING_MODEL)) as unknown as EmbedderFn;
    await this._loadOrBuildCache();
  }

  private async _loadOrBuildCache(): Promise<void> {
    // Group fragments by source for per-source cache handling
    const bySource = new Map<string, string[]>();
    for (const source of this.graph.sources) {
      bySource.set(source.sourceId, []);
    }
    for (const [path] of this.graph.fragments) {
      const source = this.graph.sourceMap.get(path);
      if (source) bySource.get(source.sourceId)?.push(path);
    }

    const changedSources = new Set<string>();

    for (const source of this.graph.sources) {
      const cache = loadCache(source.cacheDir);
      const fragmentPaths = bySource.get(source.sourceId) ?? [];

      for (const path of fragmentPaths) {
        const fragment = this.graph.fragments.get(path);
        if (!fragment) continue;

        const text = this._embedText(fragment.title, fragment.tags, fragment.content);
        const hash = fragmentHash(text);

        const cached = cache?.[path];
        if (cached && cached.hash === hash && cached.embedding?.length === EMBEDDING_DIM) {
          this.embeddings.set(path, new Float32Array(cached.embedding));
        } else {
          const vec = await this._embed("passage: " + text);
          this.embeddings.set(path, vec);
          changedSources.add(source.sourceId);
        }
      }
    }

    // Drop vectors for fragments that no longer exist or were deprecated.
    for (const path of this.embeddings.keys()) {
      if (!this.graph.fragments.has(path)) {
        const source = this.graph.sourceMap.get(path);
        if (source) changedSources.add(source.sourceId);
        this.embeddings.delete(path);
      }
    }

    // Persist only changed sources
    for (const sid of changedSources) {
      this._persistSource(sid);
    }

    // Rebuild BM25 index after embedding cache is ready
    this.bm25.buildIndex(this.graph);
  }

  private _persistSource(sourceId: string): void {
    const source = this.graph.sources.find((s) => s.sourceId === sourceId);
    if (!source) return;

    const fragments: Record<string, EmbeddingCacheEntry> = {};
    for (const [path, vec] of this.embeddings) {
      const fragSource = this.graph.sourceMap.get(path);
      if (fragSource?.sourceId !== sourceId) continue;
      const frag = this.graph.fragments.get(path);
      if (!frag) continue;
      const text = this._embedText(frag.title, frag.tags, frag.content);
      fragments[path] = { hash: fragmentHash(text), embedding: Array.from(vec) };
    }
    if (Object.keys(fragments).length > 0) {
      saveCache(source.cacheDir, fragments);
    }
  }

  private _embedText(title: string, tags: string[], content: string): string {
    // Title repeated for embedding weight boost
    return `${title}\n${title}\n${tags.join(" ")}\n${content}`;
  }

  private async _embed(text: string): Promise<Float32Array> {
    if (!this.embedder) throw new Error("Embedder not initialized");
    const output = await this.embedder(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  }

  async search(
    query: string,
    topK = DEFAULT_SEMANTIC_TOP_K,
    threshold = DEFAULT_SEMANTIC_THRESHOLD,
    alpha = DEFAULT_HYBRID_ALPHA,
  ): Promise<SemanticHit[]> {
    await this.ensureReady();
    const queryVec = await this._embed("query: " + query);

    // Cosine similarity scores
    const cosineScores = new Map<string, number>();
    for (const [path, vec] of this.embeddings) {
      let dot = 0;
      for (let i = 0; i < EMBEDDING_DIM; i++) dot += queryVec[i] * vec[i];
      cosineScores.set(path, dot);
    }

    // BM25 scores
    const bm25Scores = this.bm25.score(query);

    // Min-max normalize both score sets
    const cosineNorm = minMaxNormalize(cosineScores);
    const bm25Norm = minMaxNormalize(bm25Scores);

    // Combine: hybrid = α × cosine + (1-α) × BM25
    const all: SemanticHit[] = [];
    for (const [path] of this.embeddings) {
      const cs = cosineNorm.get(path) ?? 0;
      const bs = bm25Norm.get(path) ?? 0;
      const hybrid = alpha * cs + (1 - alpha) * bs;
      all.push({ path, score: hybrid });
    }

    all.sort((a, b) => b.score - a.score);
    const above = all.filter((s) => s.score >= threshold);
    const results = above.length > 0 ? above : all.slice(0, 1);
    return results.slice(0, topK);
  }

  /** Debounced rebuild — safe to call from a file watcher. */
  scheduleRebuild(): void {
    if (this._rebuildRunning) {
      this._rebuildQueued = true;
      return;
    }
    void this._runRebuild();
  }

  private async _runRebuild(): Promise<void> {
    if (!this._initPromise || !this.embedder) return;
    try {
      await this._initPromise;
    } catch {
      return;
    }
    this._rebuildRunning = true;
    try {
      await this._loadOrBuildCache();
    } catch (e) {
      console.error("EmbeddingEngine rebuild failed:", (e as Error).message);
    } finally {
      this._rebuildRunning = false;
      if (this._rebuildQueued) {
        this._rebuildQueued = false;
        void this._runRebuild();
      }
    }
  }
}

/** Min-max normalize a score map to [0, 1]. Returns a new map. */
function minMaxNormalize(scores: Map<string, number>): Map<string, number> {
  if (scores.size === 0) return scores;

  let min = Infinity;
  let max = -Infinity;
  for (const s of scores.values()) {
    if (s < min) min = s;
    if (s > max) max = s;
  }

  const range = max - min;
  const result = new Map<string, number>();
  for (const [path, s] of scores) {
    result.set(path, range > 0 ? (s - min) / range : 0);
  }
  return result;
}
