---
tags: [architecture, overview]
related: [architecture/multi-source, architecture/discovery]
refs: [src/core/graph.ts, src/core/store.ts, src/mcp/server.ts]
---
# Three-Layer Architecture

KnowledgeBased uses a three-layer architecture:

## Core Layer (`src/core/`)
Domain logic with no MCP awareness. Read/write split:
- `KnowledgeGraph` — in-memory index (fragments, tags, graph edges). Read-only queries.
- `FragmentStore` — mutation gateway. Every write triggers `graph.buildIndex()`.
- `loader.ts` — filesystem walking + frontmatter parsing.
- `validator.ts` — validates `refs:` against project files, `related:` within same source.

## Embeddings Layer (`src/embeddings/`)
- `EmbeddingEngine` — lazy-loads `Xenova/multilingual-e5-small`, per-source cache persistence.
- `cache.ts` — deterministic hash-based cache with version/model/dim guards.

## MCP Layer (`src/mcp/`)
- `server.ts` — wires sources → graph → store → engine → MCP tools.
- Tools grouped by action: `search.ts`, `manage.ts`, `inspect.ts`.
- `ToolContext` DI pattern passes shared deps to each tool registrar.
