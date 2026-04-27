# knowledgebased

A reusable [Model Context Protocol](https://modelcontextprotocol.io) server that provides semantic search and a tag-based knowledge graph for any project. Auto-discovers a knowledge directory from cwd; silently disables when absent.

Written in TypeScript. Uses local sentence-transformer embeddings (`Xenova/multilingual-e5-small`) — no API keys, no network calls after the first model download.

## Features

- 🔍 **Semantic search** — embedding-based natural language queries (multilingual)
- 🤖 **RAG search** — tiered results with automatic LLM summarization via MCP sampling
- 🏷️ **Tag search with graph traversal** — follow `related:` links across fragments
- 📝 **Markdown fragments with YAML frontmatter** — human-readable, git-friendly
- 🚀 **Zero overhead when unused** — exits silently if no knowledge is present
- 🔧 **Flexible auto-discovery** — co-located, hidden, sibling, or user-global

## Quick Start

### Install

```bash
npm install -g knowledgebased
# or run on demand:
npx -y knowledgebased setup
```

`setup` registers the server in `~/.copilot/mcp-config.json` (or you can configure any MCP client manually). It will:
- **Auto-activate** in any project where knowledge is discovered
- **Stay disabled** (zero overhead) elsewhere

### Per-repo install (any MCP client)

Add to your `.mcp.json` / client config:

```json
{
  "mcpServers": {
    "knowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "knowledgebased"]
    }
  }
}
```

## Knowledge Discovery

The server discovers knowledge from two independent phases, then **unions** all results.

Given `cwd = ~/workspace/my-project/`, here is every location the server checks:

```
~/
├── .knowledgebased.json                  ← Phase 2: user-global config (always read)
├── notes/                                ← Phase 2: external KB (declared in bases)
│   └── *.md
│
└── workspace/
    ├── my-project.knowledge/             ← Phase 1 ④: sibling folder
    │   └── *.md
    │
    └── my-project/                       ← cwd
        ├── .knowledge.json               ← Phase 1 ①: config pointer (highest pri)
        ├── knowledge/                    ← Phase 1 ②: co-located, visible
        │   └── *.md
        ├── .knowledge/                   ← Phase 1 ③: co-located, hidden
        │   └── *.md
        └── src/
```

### Phase 1 — project source

Walks up from cwd. At **each** ancestor directory, tries four patterns in order — **first match stops the entire walk**:

| Priority | Pattern | Within git root | Beyond git root |
|----------|---------|:-:|:-:|
| ① | `.knowledge.json` | ✅ | ✅ (explicit intent) |
| ② | `knowledge/` | ✅ | ❌ (too generic) |
| ③ | `.knowledge/` | ✅ | ❌ (too generic) |
| ④ | `../<project>.knowledge/` | ✅ | ✅ (explicit naming) |

Beyond the git root, only explicitly-intentioned patterns (① config pointer and ④ sibling) are checked. If **no git root is found at all**, generic patterns are never used — only ① and ④ apply. This prevents accidental matches with unrelated `knowledge/` directories outside a project context.

Result: 0 or 1 **project source** (alias: `repo`, refs validated against cwd).

### Phase 2 — external knowledge bases

Always runs (even if Phase 1 found a project source). Reads `~/.knowledgebased.json` and matches cwd against `repos` entries.

Result: 0–N **external sources** (alias: base ID, refs unscoped). Both phases are unioned and deduped by canonical directory hash.

### User-global config (`~/.knowledgebased.json`)

Defines named knowledge bases and binds them to repos:

```json
{
  "bases": {
    "personal": "~/notes",
    "team": { "knowledge": "~/team/conventions", "cacheDir": "~/.cache/team" }
  },
  "repos": {
    "*": ["personal"],
    "~/workspace/my-project": ["team"]
  }
}
```

| Field | Description |
|-------|-------------|
| `bases.<id>` | A string path (shorthand) or `{ "knowledge": "...", "cacheDir": "..." }`. Paths support `~` expansion. |
| `repos."*"` | Wildcard — these bases are active in **every** project. |
| `repos.<path>` | Array of base IDs to activate when cwd is inside this path. **Longest-prefix match** wins (segment-boundary, case-insensitive on Windows). |

In the example above:
- `personal` is available everywhere (wildcard `"*"`)
- `team` is only available when working inside `~/workspace/my-project`
- Fragments from external sources are prefixed with their alias: `personal@notes/foo.md`

### Per-project config (`.knowledge.json`)

Points to a knowledge directory that lives elsewhere:

```json
{ "knowledge": "../shared-kb", "cacheDir": "./.cache/embeddings" }
```

| Field | Required | Description |
|-------|----------|-------------|
| `knowledge` | optional | Path to the knowledge directory. Resolved relative to the config file. Defaults to `./knowledge`. |
| `cacheDir` | optional | Override for the embedding cache. Defaults to `~/.cache/knowledgebased/<hash>`. |

### Validation rules

These conditions cause a **loud startup error**:
- `repos` references a non-existent base ID
- Base ID is `"*"`, or contains `@`, `/`, or spaces
- Two bases resolve to the same canonical directory

## Knowledge Fragments

Markdown files with YAML frontmatter:

```markdown
---
tags: [workflow, git]
related: [workflow/branch-naming]
source: session/2026-04-21
verified: false
refs: [src/utils.ts::parseArgs]
---
# Fragment Title

Content goes here...
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_knowledge` | Tag-based search with graph traversal |
| `search_semantic` | Embedding-based semantic search with similarity scores |
| `search_rag` | Semantic search with automatic LLM summarization via MCP sampling |
| `list_tags` | List all tags with counts |
| `list_sources` | List loaded knowledge sources |
| `add_knowledge` | Create a new fragment |
| `update_knowledge` | Update an existing fragment |
| `delete_knowledge` | Delete a fragment permanently |
| `audit_knowledge` | Validate refs and related links |
| `reload_sources` | Re-discover sources from config |

### search_rag — RAG-style search

`search_rag` combines semantic search with MCP client [sampling](https://modelcontextprotocol.io/specification/2025-03-26/server/sampling) to deliver concise, query-aware results. Results are split into tiers:

| Tier | Score | Behavior |
|------|-------|----------|
| **direct** | ≥ `directThreshold` (0.9) | Full content returned verbatim |
| **related** | One-hop graph neighbors of direct hits | Summarized via LLM sampling |
| **summarized** | ≥ `threshold` (0.85), < `directThreshold` | Summarized via LLM sampling |

Every response includes a **references table** listing all used fragments with their similarity score, tier, and reason for inclusion.

When the MCP client doesn't support sampling, summarized/related fragments fall back to metadata-only output (title, tags, and a content preview).

**Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | — | Natural language search query |
| `threshold` | 0.85 | Minimum similarity score for inclusion |
| `directThreshold` | 0.9 | Score above which fragments are returned verbatim |
| `maxTokens` | 500 | Max tokens for the LLM summary |

## CLI Commands

```bash
knowledgebased setup                         # Register globally in ~/.copilot/mcp-config.json
knowledgebased init                          # Create knowledge/ in cwd
knowledgebased init --knowledge ../other/kb  # Create .knowledge.json pointing elsewhere
```

## Development

```bash
npm install
npm run build      # compile TS → dist/
npm test           # run unit tests via node:test + tsx
npm start          # run from compiled output
npm run watch      # incremental rebuild
```

## License

MIT
