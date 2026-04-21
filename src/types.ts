// ─── Configuration ───────────────────────────────────────────────

/**
 * Describes a single knowledge source — shared shape between
 * project `.knowledge.json` and entries in `bases`.
 */
export interface KnowledgeConfig {
  /** Path to the knowledge directory. */
  knowledge?: string;
  /** Cache dir override. */
  cacheDir?: string;
}

/**
 * Raw JSON schema for `~/.knowledgebased.json`.
 */
export interface RawKnowledgeConfig {
  /** Named knowledge bases. Value is a path string (shorthand) or KnowledgeConfig. */
  bases?: Record<string, string | KnowledgeConfig>;
  /** Repo bindings — which repos use which bases. */
  repos?: Record<string, string[]>;
}

/** A fully resolved knowledge source ready for the engine. */
export interface ResolvedSource {
  /** Stable identifier derived from canonical knowledgeDir hash. */
  sourceId: string;
  /** User-facing alias: "repo" for project source, KB id for external bases. */
  alias: string;
  /** Absolute path to the directory containing markdown fragments. */
  knowledgeDir: string;
  /** Absolute path for embedding cache. */
  cacheDir: string;
  /** How refs are validated: "cwd" = against process.cwd(), "unscoped" = skip. */
  refScope: "cwd" | "unscoped";
}

// ─── Fragment domain types ───────────────────────────────────────

export interface Fragment {
  tags: string[];
  related: string[];
  source: string | null;
  refs: string[];
  content: string;
  title: string;
}

export interface FragmentResult {
  path: string;
  source: string;
  title: string;
  tags: string[];
  refs: string[];
  content: string;
}

export interface KnowledgeStats {
  total: number;
  tags: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

// ─── Store inputs/outputs ────────────────────────────────────────

export interface AddFragmentInput {
  /** Fragment path (e.g. "workflow/git" or "personal@workflow/git"). Extension optional. */
  path: string;
  title: string;
  content: string;
  tags: string[];
  related?: string[];
  refs?: string[];
  /** Frontmatter `source` field — origin of this knowledge (not the KB alias). */
  source?: string | null;
}

export interface UpdateFragmentInput {
  content?: string;
  tags?: string[];
  related?: string[];
  refs?: string[];
}

export interface MutationResult {
  success: boolean;
  path?: string;
  error?: string;
  warnings?: string[];
}

// ─── Embeddings ──────────────────────────────────────────────────

export interface SemanticHit {
  path: string;
  score: number;
}

export interface EmbeddingCacheEntry {
  hash: string;
  embedding: number[];
}

export interface EmbeddingCacheFile {
  version: number;
  model: string;
  dim: number;
  fragments: Record<string, EmbeddingCacheEntry>;
}
