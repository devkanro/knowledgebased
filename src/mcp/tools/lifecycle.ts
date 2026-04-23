import { discoverSources } from "../../discovery.js";
import { KnowledgeGraph } from "../../core/graph.js";
import { FragmentStore } from "../../core/store.js";
import { EmbeddingEngine } from "../../embeddings/engine.js";
import type { ToolRegistrar } from "./context.js";

export const registerLifecycleTools: ToolRegistrar = (server, dctx) => {
  // ── reload_sources ─────────────────────────────────────────────
  server.tool(
    "reload_sources",
    "Re-discover knowledge sources from config. Use after modifying ~/.knowledgebased.json.",
    {},
    async () => {
      const ctx = await dctx.waitForInit();
      const startDir = ctx.outputRoot;

      const oldAliases = new Set(ctx.graph.sources.map(s => s.alias));
      const sources = discoverSources(startDir);
      const newAliases = new Set(sources.map(s => s.alias));

      const added = sources.filter(s => !oldAliases.has(s.alias)).map(s => s.alias);
      const removed = [...oldAliases].filter(a => !newAliases.has(a));

      const graph = new KnowledgeGraph(sources, startDir);
      graph.buildIndex();

      const store = new FragmentStore(graph);
      const embeddings = new EmbeddingEngine(graph);
      embeddings.startInit();

      dctx.update({ graph, store, embeddings, outputRoot: startDir });

      return text(
        `Reloaded sources.\nTotal: ${sources.length}\nAdded: ${added.join(", ") || "none"}\nRemoved: ${removed.join(", ") || "none"}`
      );
    }
  );
};

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}
