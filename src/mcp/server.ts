import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { watch } from "fs";

import { SERVER_NAME, SERVER_VERSION, WATCH_DEBOUNCE_MS } from "../constants.js";
import { KnowledgeGraph } from "../core/graph.js";
import { FragmentStore } from "../core/store.js";
import { EmbeddingEngine } from "../embeddings/engine.js";
import type { ResolvedSource } from "../types.js";
import { registerAllTools, type ToolContext } from "./tools/index.js";

export async function startServer(sources: ResolvedSource[]): Promise<void> {
  const projectRoot = process.cwd();

  const graph = new KnowledgeGraph(sources, projectRoot);
  graph.buildIndex();

  const store = new FragmentStore(graph);
  const embeddings = new EmbeddingEngine(graph);
  embeddings.startInit();

  for (const source of sources) {
    attachWatcher(source.knowledgeDir, graph, embeddings);
  }

  const ctx: ToolContext = {
    graph,
    store,
    embeddings,
    outputRoot: projectRoot,
  };

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerAllTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** Watch a knowledge dir; on .md change → reindex graph + debounced embedding rebuild. */
function attachWatcher(knowledgeDir: string, graph: KnowledgeGraph, embeddings: EmbeddingEngine): void {
  try {
    let timer: NodeJS.Timeout | null = null;
    watch(knowledgeDir, { recursive: true }, (_eventType, filename) => {
      if (!filename || !filename.endsWith(".md")) return;
      graph.buildIndex();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => embeddings.scheduleRebuild(), WATCH_DEBOUNCE_MS);
    });
  } catch {
    // fs.watch may not be available on all platforms — tolerate it
  }
}
