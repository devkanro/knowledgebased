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

The server discovers knowledge from two independent phases, then **unions** all results:

```
discoverSources(cwd)
│
├── Phase 1: Project source (walk up from cwd)
│   │
│   │  For each ancestor directory, try in order (first match wins):
│   │
│   ├── .knowledge.json          ← explicit config pointer (highest priority)
│   ├── knowledge/               ← co-located, visible (most common)
│   ├── .knowledge/              ← co-located, hidden
│   └── <parent>/<name>.knowledge/  ← sibling folder
│
│   Result: 0 or 1 project source (alias: "repo", refs validated against cwd)
│
├── Phase 2: External sources (~/.knowledgebased.json)
│   │
│   │  Always runs (even if Phase 1 found something).
│   │  Matches cwd against `repos` entries:
│   │
│   ├── repos["*"]               ← wildcard, always included
│   └── repos["/path/to/repo"]   ← longest-prefix match against cwd
│
│   Result: 0–N external sources (alias: base ID, refs unscoped)
│
└── Union + dedupe by canonical knowledgeDir hash
    └── Final: ResolvedSource[]
```

### Phase 1 — project source

The walk-up tries four patterns at each ancestor directory. The **first match stops the walk entirely**:

| Priority | Pattern | Use case |
|----------|---------|----------|
| 1 | `.knowledge.json` | Knowledge lives elsewhere; config points to it |
| 2 | `knowledge/` | Default — co-located and visible |
| 3 | `.knowledge/` | Hidden from `ls` |
| 4 | `../<project>.knowledge/` | Sibling folder — project repo stays unmodified |

### Phase 2 — external knowledge bases

`~/.knowledgebased.json` defines named knowledge bases and binds them to repos:

```json
{
  "bases": {
    "personal": "~/notes",
    "team-conventions": { "knowledge": "~/team/conventions", "cacheDir": "~/.cache/team" }
  },
  "repos": {
    "*": ["personal"],
    "~/source/my-project": ["team-conventions"]
  }
}
```

How matching works:
- **`"*"` (wildcard)** — these bases are active in **every** project
- **Path entries** — matched via **longest-prefix** against cwd (segment-boundary, case-insensitive on Windows)
- Both wildcard and path matches are unioned together

In the example above:
- `personal` is available everywhere (wildcard `"*"`)
- `team-conventions` is only available when cwd is inside `~/source/my-project`
- Fragments from external sources are prefixed with their alias: `personal@notes/foo.md`

### Example layouts

```
# ① Co-located (default, most common)
my-project/
├── knowledge/           ← Phase 1 discovers this
│   └── workflow/
│       └── git.md
└── src/

# ② Hidden co-located
my-project/
├── .knowledge/          ← Phase 1 discovers this
└── src/

# ③ Sibling folder (project repo stays clean)
workspace/
├── my-project/          ← cwd
│   └── src/
└── my-project.knowledge/  ← Phase 1 discovers this
    └── ...

# ④ Pointer config (knowledge lives anywhere)
my-project/
├── .knowledge.json      ← { "knowledge": "/shared/team-kb" }
└── src/

# ⑤ Project + personal overlay (Phase 1 + Phase 2 combined)
my-project/
├── knowledge/           ← Phase 1: project source (alias: "repo")
└── src/
~/.knowledgebased.json   ← Phase 2: adds personal KB (alias: "personal")
~/notes/                 ← external KB directory
```

### Config schemas

**`.knowledge.json`** (per-project, Phase 1):

```json
{ "knowledge": "./knowledge", "cacheDir": "./.cache/embeddings" }
```

**`~/.knowledgebased.json`** (user-global, Phase 2):

```json
{
  "bases": {
    "<id>": "<path>"
  },
  "repos": {
    "*": ["<id>"],
    "/path/to/repo": ["<id>"]
  }
}
```

| Field | Description |
|-------|-------------|
| `bases.<id>` | A string path (shorthand) or `{ "knowledge": "...", "cacheDir": "..." }`. Paths support `~` expansion. |
| `repos.<path>` | Array of base IDs to activate when cwd matches this path prefix. `"*"` = always active. |

**Validation rules** (fail loudly at startup):
- `repos` references a non-existent base ID → error
- Base ID is `"*"`, or contains `@`, `/`, or spaces → error
- Two bases resolve to the same directory → error

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
