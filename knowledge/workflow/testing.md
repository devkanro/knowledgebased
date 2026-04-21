---
tags: [workflow, testing]
related: [architecture/layers]
refs: [src/test-utils.ts, src/core/graph.spec.ts, src/discovery.spec.ts]
---
# Testing Strategy

## Infrastructure
- **Runner**: Node 20+ built-in `node:test`
- **TS execution**: `tsx` (devDep) — understands ESM `.js` extension convention
- **Test command**: `node --import tsx --test "src/**/*.spec.ts"`
- **Build exclusion**: `tsconfig.json` excludes `*.spec.ts` and `test-utils.ts` from output

## Fixture System (`test-utils.ts`)
`makeFixture()` creates isolated tmp directories:
```typescript
const fx = makeFixture();
fx.writeFragment("workflow/git.md", { tags: ["git"] }, "# Git\n");
const graph = new KnowledgeGraph([fx.toSource()], fx.root);
// ... test ...
fx.cleanup();
```

`makeExternalFixture("alias")` creates a second KB source for multi-source tests.

## Test Patterns
- **Single-source**: `new KnowledgeGraph([fx.toSource()], fx.root)` — most core tests
- **Multi-source**: two fixtures, two sources in array — tests prefixing, isolation, routing
- **Discovery**: `discoverSources(fx.root, NO_GLOBAL)` — `NO_GLOBAL` silences real `~/.knowledgebased.json`
- **Validator**: bare `Map<string, Fragment>` — no filesystem needed

## Coverage Areas
- Core: graph indexing, tag search, hop traversal, stats
- Store: add/update routing, duplicate detection, warning surfacing
- Discovery: 4 patterns, walk-up, global config, validation errors
- Validator: refs against disk, related within source, cross-source rejection
- Embeddings: cache roundtrip, version guards
- Format: markdown rendering, query output files
