---
tags: [workflow, release, npm]
related: [workflow/testing]
refs: [.github/workflows/publish.yml, package.json]
---
# Release Workflow

## Versioning
Standard semver via `npm version`:
```bash
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.1 → 0.2.0
npm version major   # 0.2.0 → 1.0.0
```
This creates a git commit + `v*` tag automatically.

## Publishing
Push the tag triggers GitHub Actions:
```bash
git push --follow-tags
```

The `publish.yml` workflow:
1. `npm ci` — clean install
2. `npm run build` — TypeScript compilation
3. `npm test` — run all 65 tests
4. `npm publish --provenance --access public` — publish with OIDC (Trusted Publishing)

## Trusted Publishing (OIDC)
No `NPM_TOKEN` secret needed. GitHub Actions authenticates directly with npm via short-lived OIDC tokens. Configure once at npmjs.com → package settings → Trusted Publishers.
