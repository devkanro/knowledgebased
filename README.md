# knowledgebased

A reusable [Model Context Protocol](https://modelcontextprotocol.io) server that provides semantic search and a tag-based knowledge graph for any project. Auto-discovers a knowledge directory from cwd; silently disables when absent.

Written in TypeScript. Uses local sentence-transformer embeddings (`Xenova/multilingual-e5-small`) — no API keys, no network calls after the first model download.

## Features

- 🔍 **Semantic search** — embedding-based natural language queries (multilingual)
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

Resolution proceeds in two phases. The first match wins; the rest is skipped.

### Phase 1 — walk up from cwd

At each ancestor directory the server tries:

| # | Pattern | Notes |
|---|---|---|
| 1 | `<dir>/.knowledge.json` | Explicit config file (highest priority within the dir) |
| 2 | `<dir>/knowledge/` | Co-located, visible — most common |
| 3 | `<dir>/.knowledge/` | Co-located, hidden (won't show in `ls`) |
| 4 | `<dir>/../<basename>.knowledge/` | Sibling folder named `<project>.knowledge` |

### Phase 2 — user-global fallback

If Phase 1 reaches the filesystem root with no match, the server reads:

```
~/.knowledgebased.json
```

Useful for users who maintain a personal knowledge base they want available in every project. If that file is also absent, the server exits silently.

### Example layouts

**Co-located (default):**
```
my-project/
├── knowledge/          ← discovered
└── src/
```

**Hidden co-located** (don't clutter `ls` output):
```
my-project/
├── .knowledge/         ← discovered
└── src/
```

**Sibling** (project repo is read-only or you don't want to add files to it):
```
workspace/
├── my-project/             ← cwd
└── my-project.knowledge/   ← discovered as sibling
    └── ...
```

**Pointer config** (knowledge lives anywhere):
```
my-project/
├── .knowledge.json     ← { "knowledge": "../shared-kb/knowledge" }
└── src/
```

**User-global** (active in every project as a fallback):
```
~/
├── .knowledgebased.json   ← { "knowledge": "./notes/knowledge" }
└── notes/
    └── knowledge/
        └── ...
```

### Config file schema

Both `.knowledge.json` (per-project) and `~/.knowledgebased.json` (user-global) share the same shape:

```json
{
  "knowledge": "./knowledge",
  "cacheDir": "./.cache/embeddings"
}
```

| Field | Required | Notes |
|---|---|---|
| `knowledge` | optional | Path to the knowledge directory. Resolved relative to the config file. Defaults to `./knowledge`. |
| `cacheDir` | optional | Override for the embedding cache. Resolved relative to the config file. Defaults to `~/.cache/knowledgebased/<hash>`. |

The server's project root (used for resolving `refs:` like `src/foo.ts::bar` and writing query outputs) is always the cwd it was launched from — it's never stored in config.

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
| `search_semantic` | Embedding-based semantic search |
| `list_tags` | List all tags with counts |
| `list_sources` | List loaded knowledge sources |
| `add_knowledge` | Create a new fragment |
| `update_knowledge` | Update an existing fragment |
| `delete_knowledge` | Delete a fragment permanently |
| `audit_knowledge` | Validate refs and related links |
| `reload_sources` | Re-discover sources from config |

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
