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
2. `knowledge/` — co-located, visible
3. `.knowledge/` — co-located, hidden
4. `<parent>/<basename>.knowledge/` — sibling folder

First match wins. The walk stops.

## Phase 2 — User-Global Config

If Phase 1 reaches filesystem root with no match, read `~/.knowledgebased.json`:
- `repos["*"]` entries always apply (wildcard).
- Non-wildcard entries: **longest-prefix match** wins (segment-boundary, case-insensitive on Windows).

## Path Canonicalization
- `~` expanded via `os.homedir()`
- `resolve()` for absolute paths
- Windows: lowercased for comparison
- Segment-boundary check prevents `/foo/bar` matching `/foo/barbaz`
