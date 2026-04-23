import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { watch } from "fs";
import { fileURLToPath } from "url";

import { SERVER_NAME, SERVER_VERSION, WATCH_DEBOUNCE_MS } from "../constants.js";
import { discoverSources } from "../discovery.js";
import { KnowledgeGraph } from "../core/graph.js";
import { FragmentStore } from "../core/store.js";
import { EmbeddingEngine } from "../embeddings/engine.js";
import type { ResolvedSource } from "../types.js";
import { DeferredToolContext } from "./tools/context.js";
import { registerAllTools } from "./tools/index.js";

/**
 * Start the MCP server with deferred knowledge discovery.
 *
 * Discovery uses MCP `roots` to determine the user's workspace directory,
 * with `cwdOverride` (from `--cwd` CLI arg) as highest priority fallback.
 */
export async function startServer(cwdOverride?: string): Promise<void> {
  const dctx = new DeferredToolContext();

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
  );

  // Register tools before connect — they await dctx.ready internally.
  registerAllTools(server, dctx);

  // After client sends `initialized`, resolve workspace and complete setup.
  server.server.oninitialized = () => {
    initializeKnowledge(server, dctx, cwdOverride).catch((err) => {
      console.error("knowledgebased: initialization failed:", err);
      dctx.failInit(err instanceof Error ? err : new Error(String(err)));
    });
  };

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** Resolve workspace root via MCP roots, then discover and index knowledge. */
async function initializeKnowledge(
  server: McpServer,
  dctx: DeferredToolContext,
  cwdOverride?: string,
): Promise<void> {
  // Priority: --cwd > MCP roots > process.cwd()
  let startDir = cwdOverride ?? process.cwd();

  if (!cwdOverride) {
    try {
      const rootsResult = await server.server.listRoots();
      const roots = rootsResult?.roots;
      if (roots && roots.length > 0) {
        // Find the first file:// root that looks like a local path
        for (const root of roots) {
          if (root.uri.startsWith("file://")) {
            try {
              startDir = fileURLToPath(root.uri);
              break;
            } catch {
              // Invalid URI — try next root
            }
          }
        }
      }
    } catch {
      // Client may not support roots — fall back to process.cwd()
    }
  }

  const sources = discoverSources(startDir);
  if (sources.length === 0) {
    console.error("knowledgebased: no knowledge sources found for " + startDir);
    // Still initialize with empty graph so tools return "no fragments" instead of hanging
  }

  const graph = new KnowledgeGraph(sources, startDir);
  graph.buildIndex();

  const store = new FragmentStore(graph);
  const embeddings = new EmbeddingEngine(graph);
  embeddings.startInit();

  for (const source of sources) {
    attachWatcher(source.knowledgeDir, graph, embeddings);
  }

  dctx.initialize({ graph, store, embeddings, outputRoot: startDir });
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
