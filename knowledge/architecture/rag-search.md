---
tags: [architecture, rag, search, sampling]
related: [architecture/layers, architecture/multi-source]
refs: [src/mcp/tools/rag.ts, src/mcp/sampling.ts, src/constants.ts]
---
# RAG Search (search_rag)

Tiered semantic search that uses MCP client sampling to summarize lower-confidence results.

## Tiers

Results are classified by similarity score into three tiers:

| Tier | Score | Behavior |
|------|-------|----------|
| **direct** | ≥ `directThreshold` (default 0.9) | Full content returned verbatim |
| **related** | One-hop `graphIndex` neighbors of direct hits | Fed into LLM summary |
| **summarized** | ≥ `threshold` (default 0.85), < `directThreshold` | Fed into LLM summary |

Only direct-tier fragments get full content. Related and summarized fragments are batched and sent to the client LLM via `sampling/createMessage` for a query-aware synthesis.

## Sampling

Uses MCP `sampling/createMessage` to ask the client's LLM to produce a concise summary:
- System prompt instructs extraction of query-relevant information only
- Model preferences hint toward fast/cheap models (claude-haiku, gpt-4o-mini)
- Input is capped: max 20 fragments, each truncated to 2000 chars

Capability detection via `_clientCapabilities.sampling` (private field).

## Fallback

When sampling is unavailable (client doesn't support it, or `createMessage` fails):
- Related and summarized fragments degrade to **metadata-only**: title, tags, and first 200 chars of content
- Tier labels in the references table reflect actual outcome (e.g., `metadata-only` instead of `summarized`)

## Response Structure

1. **References table** — all used fragments with path, title, score, tier, and reason
2. **Direct Results** — full content of high-confidence hits
3. **Summary** — LLM-generated synthesis (or metadata fallback)
4. **Compression warning** — shown when many fragments are compressed into few tokens, suggesting `search_knowledge` for full content

## Validation

- `directThreshold` must be greater than `threshold` (error returned otherwise)
- Below-threshold fallback results from the embedding engine are filtered out

## Tool Selection Guidance

- Use `search_rag` when answering user questions — delivers concise, ready-to-use answers
- Prefer `search_semantic` for exploring what the knowledge base covers
- Prefer `search_knowledge` when you need full unabridged content for specific tags
- If `search_rag` summary is missing key details, follow up with `search_knowledge` using tags from the references table
