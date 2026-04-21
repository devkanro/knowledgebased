// Public API barrel for programmatic use
export * from "./types.js";
export { discoverKnowledge, discoverSources } from "./discovery.js";
export { KnowledgeGraph, qualifyPath, parsePath } from "./core/graph.js";
export { FragmentStore } from "./core/store.js";
export { validateRefs, validateRelated } from "./core/validator.js";
export { EmbeddingEngine } from "./embeddings/engine.js";
export { startServer } from "./mcp/server.js";
