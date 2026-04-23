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

/**
 * Deferred version of ToolContext for lazy initialization.
 * Tools await `ready` before accessing the underlying context.
 */
export class DeferredToolContext {
  private _ctx: ToolContext | null = null;
  private _error: Error | null = null;
  private _resolveReady!: () => void;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this._resolveReady = resolve;
    });
  }

  /** Initialize the context and unblock waiting tools. */
  initialize(ctx: ToolContext): void {
    if (this._ctx) throw new Error("DeferredToolContext already initialized");
    this._ctx = ctx;
    this._resolveReady();
  }

  /** Get the initialized context. Throws if not yet initialized. */
  get ctx(): ToolContext {
    if (!this._ctx) throw new Error("knowledgebased is still initializing — try again shortly");
    return this._ctx;
  }

  /** Signal that initialization has failed; unblock waiting tools with an error. */
  failInit(err: Error): void {
    this._error = err;
    this._resolveReady();
  }

  /** Replace the context after a reload. */
  update(ctx: ToolContext): void {
    this._ctx = ctx;
  }

  /** Await initialization and return the ready context. */
  async waitForInit(): Promise<ToolContext> {
    await this.ready;
    if (this._error) throw this._error;
    return this.ctx;
  }
}

export type ToolRegistrar = (server: McpServer, ctx: DeferredToolContext) => void;
