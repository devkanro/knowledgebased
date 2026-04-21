import { REPO_SOURCE_ALIAS } from "../constants.js";
import type { Fragment, FragmentResult, KnowledgeStats, ResolvedSource, TagCount } from "../types.js";
import { walkDir, parseFragmentFile } from "./loader.js";

/**
 * In-memory knowledge index across multiple sources. Owns:
 *   - fragments      : qualifiedPath → Fragment
 *   - sourceMap      : qualifiedPath → ResolvedSource
 *   - tagIndex       : tag  → Set<qualifiedPath>
 *   - graphIndex     : qualifiedPath → Set<related qualifiedPath>  (bidirectional)
 *
 * Fragment paths are qualified: repo source uses bare paths (`workflow/git.md`),
 * external KBs use `alias@relPath` (e.g. `personal@notes/foo.md`).
 *
 * READ-ONLY API. For mutations see {@link FragmentStore}.
 */
export class KnowledgeGraph {
  readonly sources: ResolvedSource[];
  readonly projectRoot: string;
  readonly fragments: Map<string, Fragment> = new Map();
  readonly sourceMap: Map<string, ResolvedSource> = new Map();
  readonly tagIndex: Map<string, Set<string>> = new Map();
  readonly graphIndex: Map<string, Set<string>> = new Map();

  constructor(sources: ResolvedSource[], projectRoot: string) {
    this.sources = sources;
    this.projectRoot = projectRoot;
  }

  /** Scan disk and rebuild all indices across all sources. */
  buildIndex(): void {
    this.fragments.clear();
    this.sourceMap.clear();
    this.tagIndex.clear();
    this.graphIndex.clear();

    for (const source of this.sources) {
      for (const filePath of walkDir(source.knowledgeDir)) {
        if (!filePath.endsWith(".md")) continue;

        const result = parseFragmentFile(filePath, source.knowledgeDir);
        if (!result) continue;

        const qualifiedPath = qualifyPath(source.alias, result.relPath);

        if (this.fragments.has(qualifiedPath)) {
          console.error(`⚠️ Duplicate fragment "${qualifiedPath}" — ignoring from ${source.alias}`);
          continue;
        }

        this.fragments.set(qualifiedPath, result.fragment);
        this.sourceMap.set(qualifiedPath, source);

        for (const tag of result.fragment.tags) {
          if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
          this.tagIndex.get(tag)!.add(qualifiedPath);
        }
      }
    }

    this._buildGraphEdges();
  }

  private _buildGraphEdges(): void {
    for (const [path, fragment] of this.fragments) {
      const source = this.sourceMap.get(path)!;
      for (const ref of fragment.related) {
        if (ref.includes("@")) continue; // cross-source ref = invalid, skip
        const resolved = this._resolveRelatedInSource(ref, source);
        if (!resolved) continue;

        if (!this.graphIndex.has(path)) this.graphIndex.set(path, new Set());
        if (!this.graphIndex.has(resolved)) this.graphIndex.set(resolved, new Set());
        this.graphIndex.get(path)!.add(resolved);
        this.graphIndex.get(resolved)!.add(path);
      }
    }
  }

  private _resolveRelatedInSource(ref: string, source: ResolvedSource): string | null {
    const withExt = ref.endsWith(".md") ? ref : ref + ".md";
    const qualifiedRef = qualifyPath(source.alias, withExt);
    return this.fragments.has(qualifiedRef) ? qualifiedRef : null;
  }

  /** Tag-search with graph-hop traversal across `related:` edges. */
  searchByTags(tags: string[], hops = 1): FragmentResult[] {
    const matched = new Set<string>();
    for (const tag of tags) {
      const paths = this.tagIndex.get(tag);
      if (paths) paths.forEach((p) => matched.add(p));
    }

    let frontier = new Set<string>(matched);
    for (let h = 0; h < hops; h++) {
      const next = new Set<string>();
      for (const path of frontier) {
        const neighbors = this.graphIndex.get(path);
        if (!neighbors) continue;
        for (const n of neighbors) {
          if (!matched.has(n)) {
            next.add(n);
            matched.add(n);
          }
        }
      }
      frontier = next;
      if (frontier.size === 0) break;
    }

    return this._collect(matched);
  }

  private _collect(paths: Set<string>): FragmentResult[] {
    const results: FragmentResult[] = [];
    for (const path of paths) {
      const f = this.fragments.get(path);
      if (!f) continue;
      const source = this.sourceMap.get(path);
      results.push({
        path,
        source: source?.alias ?? REPO_SOURCE_ALIAS,
        title: f.title,
        tags: f.tags,
        refs: f.refs,
        content: f.content,
      });
    }
    return results;
  }

  /** All non-empty tags with fragment counts, sorted desc. */
  listTags(): TagCount[] {
    const out: TagCount[] = [];
    for (const [tag, paths] of this.tagIndex) {
      if (paths.size > 0) out.push({ tag, count: paths.size });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  getStats(): KnowledgeStats {
    return { total: this.fragments.size, tags: this.tagIndex.size };
  }

  /** Look up which source a fragment belongs to. */
  sourceOf(path: string): ResolvedSource | undefined {
    return this.sourceMap.get(path);
  }

  /** Find a source by its alias. */
  sourceByAlias(alias: string): ResolvedSource | undefined {
    return this.sources.find((s) => s.alias === alias);
  }
}

// ─── Path utilities ──────────────────────────────────────────────

/** Build a qualified path: bare for repo source, `alias@relPath` for external KBs. */
export function qualifyPath(alias: string, relPath: string): string {
  return alias === REPO_SOURCE_ALIAS ? relPath : `${alias}@${relPath}`;
}

/** Parse a qualified path into alias + relPath. */
export function parsePath(path: string): { alias: string; relPath: string } {
  const atIndex = path.indexOf("@");
  if (atIndex === -1) {
    return { alias: REPO_SOURCE_ALIAS, relPath: path };
  }
  return { alias: path.slice(0, atIndex), relPath: path.slice(atIndex + 1) };
}
