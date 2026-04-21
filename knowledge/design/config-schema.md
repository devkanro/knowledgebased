---
tags: [design, config, schema]
related: [architecture/discovery, architecture/multi-source]
refs: [src/types.ts]
---
# Configuration Schema

Two config types share a unified vocabulary.

## KnowledgeConfig (single source)
Used by project `.knowledge.json` and as the value type inside `bases`:
```typescript
interface KnowledgeConfig {
  knowledge?: string;  // path to knowledge dir
  cacheDir?: string;   // embedding cache override
}
```

## RawKnowledgeConfig (global config)
Shape of `~/.knowledgebased.json`:
```typescript
interface RawKnowledgeConfig {
  bases?: Record<string, string | KnowledgeConfig>;
  repos?: Record<string, string[]>;
}
```

- `bases` value: string shorthand (`"~/notes"`) or full `KnowledgeConfig` object.
- `repos` key: absolute path or `"*"` wildcard. Value: array of base IDs.

## Validation Rules (startup)
- `repos` references non-existent base ID → **fail loud**
- Base ID = `"*"` → **fail loud** (reserved)
- Base ID contains `@`, `/`, or space → **fail loud**
- Two bases resolve to same canonical dir → **fail loud**
