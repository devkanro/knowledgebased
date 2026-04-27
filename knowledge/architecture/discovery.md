---
tags: [architecture, discovery]
related: [architecture/multi-source]
refs: [src/discovery.ts, src/constants.ts]
---
# Knowledge Discovery

The server auto-discovers knowledge sources without explicit configuration.

## Phase 1 — Walk Up From cwd

At each ancestor directory, try in priority order:

1. `.knowledge.json` — explicit config file (highest priority)
2. `knowledge/` — co-located, visible (requires git root)
3. `.knowledge/` — co-located, hidden (requires git root)
4. `<parent>/<basename>.knowledge/` — sibling folder

First match wins. The walk stops.

### Git Root Boundary

Generic patterns (② `knowledge/` and ③ `.knowledge/`) are **only checked within a git repository**:
- Within git root: all four patterns are tried
- Beyond git root: only ① `.knowledge.json` and ④ sibling are tried
- No git root found at all: only ① and ④ are tried

This prevents accidental matches with unrelated `knowledge/` directories outside a project context.

## Phase 2 — User-Global Config

Always runs (even if Phase 1 found something). Reads `~/.knowledgebased.json`:
- `repos["*"]` entries always apply (wildcard).
- Non-wildcard entries: **longest-prefix match** wins (segment-boundary, case-insensitive on Windows).
- Results from both phases are **unioned** and deduped.

## Path Canonicalization
- `~` expanded via `os.homedir()`
- `resolve()` for absolute paths
- Windows: lowercased for comparison
- Segment-boundary check prevents `/foo/bar` matching `/foo/barbaz`
