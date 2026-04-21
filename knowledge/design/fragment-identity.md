---
tags: [design, fragment, identity]
related: [architecture/multi-source, design/config-schema]
refs: [src/core/graph.ts]
---
# Fragment Identity

All sources share a **flat path namespace** with `@`-prefix disambiguation.

## Naming Rules
| Source | Path Format | Example |
|--------|-------------|---------|
| Project (repo) | `relPath` | `workflow/git.md` |
| External KB | `alias@relPath` | `personal@notes/vim.md` |

## Constraints
- Fragment paths must be globally unique. Duplicate → silently ignore later one + stderr warning.
- `@` prefix is added automatically at index time; actual filenames on disk never contain `@`.
- Files with `@` in their name are rejected by the loader.
- KB id (alias) must not contain `@`, `/`, or spaces.

## Write Routing
- `add_knowledge { path: "workflow/git" }` → repo source
- `add_knowledge { path: "personal@notes/foo" }` → KB "personal"
- Unknown alias → fail loud. No `defaultWrite` or `source` parameter needed.

## Related Links
- `related: foo/bar` → resolves within **same source only**
- `@` in `related:` value = forbidden (audit error)
- On-disk frontmatter uses bare paths; API output uses qualified paths
