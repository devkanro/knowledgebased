import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { KnowledgeGraph } from "../../core/graph.js";
import type { FragmentStore } from "../../core/store.js";
import type { EmbeddingEngine } from "../../embeddings/engine.js";

/** Shared dependencies passed to every tool registration function. */
export interface ToolContext {
  graph: KnowledgeGraph;
  store: FragmentStore;
  embeddings: EmbeddingEngine;
  /** Where to write `output: "file"` query spills. */
  outputRoot: string;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;
