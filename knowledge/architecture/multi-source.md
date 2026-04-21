---
tags: [architecture, multi-source, overlay]
related: [architecture/layers, design/fragment-identity]
refs: [src/discovery.ts, src/core/graph.ts, src/types.ts]
---
# Multi-Source Overlay

Knowledge comes from a **union** of sources, not a single directory.

## Source Types
- **Project source** — discovered via walk-up from cwd (`knowledge/`, `.knowledge/`, etc.). Alias: `repo`. Refs validated against cwd.
- **External KB** — declared in `~/.knowledgebased.json`. Alias: the base ID. Refs marked `unscoped` (not validated).

## Resolution
`discoverSources(cwd)` returns `ResolvedSource[]`:
1. Phase 1: walk up from cwd for project source (first match wins).
2. Phase 2: read `~/.knowledgebased.json`, match `repos` entries against cwd.
3. Union both phases. Dedupe by canonical `knowledgeDir` hash.

## Global Config Schema (`~/.knowledgebased.json`)
```json
{
  "bases": {
    "personal": "~/notes/personal",
    "team": { "knowledge": "~/notes/team", "cacheDir": "~/.cache/team" }
  },
  "repos": {
    "*": ["personal"],
    "/path/to/repo": ["team"]
  }
}
```

## Engine Internals
- `KnowledgeGraph` loads N directories. Fragment paths are qualified: `workflow/git.md` (repo) or `personal@notes/foo.md` (external).
- Each source gets independent embedding cache (per `sourceId` hash).
- `related:` links resolve within same source only. Cross-source references forbidden.
