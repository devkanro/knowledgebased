import { join } from "path";
import { homedir } from "os";

// ─── Embeddings ──────────────────────────────────────────────────
export const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
export const EMBEDDING_DIM = 384;
export const EMBEDDING_CACHE_VERSION = 1;

// ─── Search defaults ─────────────────────────────────────────────
export const DEFAULT_SEMANTIC_TOP_K = 10;
export const DEFAULT_SEMANTIC_THRESHOLD = 0.85;
export const DEFAULT_TAG_HOPS = 1;

// ─── RAG search defaults ────────────────────────────────────────
export const DEFAULT_RAG_THRESHOLD = 0.85;
export const DEFAULT_RAG_DIRECT_THRESHOLD = 0.9;
export const DEFAULT_RAG_SUMMARY_MAX_TOKENS = 500;

// ─── Server identity ─────────────────────────────────────────────
export const SERVER_NAME = "knowledgebased";
export const SERVER_VERSION = "0.5.0";
export const REPO_SOURCE_ALIAS = "repo";

// ─── Paths ───────────────────────────────────────────────────────
export const MCP_CONFIG_PATH = join(homedir(), ".copilot", "mcp-config.json");
export const CACHE_ROOT = join(homedir(), ".cache", SERVER_NAME);
export const QUERY_OUTPUT_SUBDIR = join(".copilot", "knowledge-queries");

/** Project-local config filename (looked up while walking up from cwd). */
export const PROJECT_CONFIG_FILE = ".knowledge.json";
/** User-global fallback config path (consulted only after the tree walk fails). */
export const USER_GLOBAL_CONFIG_PATH = join(homedir(), ".knowledgebased.json");

// ─── File watcher ────────────────────────────────────────────────
export const WATCH_DEBOUNCE_MS = 500;
