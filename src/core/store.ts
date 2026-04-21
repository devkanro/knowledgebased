import matter from "gray-matter";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

import type { AddFragmentInput, MutationResult, UpdateFragmentInput } from "../types.js";
import { KnowledgeGraph, parsePath, qualifyPath } from "./graph.js";
import { validateRefs, validateRelated } from "./validator.js";

/**
 * Mutation gateway for fragment files. Every successful write triggers
 * a full reindex on the associated graph so downstream queries stay fresh.
 *
 * Path routing: paths containing `@` (e.g. `personal@workflow/git`) are
 * routed to the corresponding external KB source. Bare paths go to the
 * repo (project) source.
 */
export class FragmentStore {
  constructor(private readonly graph: KnowledgeGraph) {}

  add(input: AddFragmentInput): MutationResult {
    const { path: rawPath, title, content, tags, related = [], refs = [], source: fmSource = null } = input;

    const { alias, relPath } = parsePath(rawPath);
    const resolvedSource = this.graph.sourceByAlias(alias);
    if (!resolvedSource) {
      return { success: false, error: `Unknown or unlinked source: "${alias}"` };
    }

    const normalizedRel = relPath.endsWith(".md") ? relPath : relPath + ".md";
    const qualifiedPath = qualifyPath(alias, normalizedRel);
    const filePath = join(resolvedSource.knowledgeDir, normalizedRel);

    if (existsSync(filePath)) {
      return { success: false, error: `Fragment already exists at ${qualifiedPath}. Use update instead.` };
    }

    mkdirSync(dirname(filePath), { recursive: true });

    const frontmatter = { tags, related, source: fmSource, refs };
    const fileContent = matter.stringify(`# ${title}\n\n${content}\n`, frontmatter);
    writeFileSync(filePath, fileContent, "utf-8");
    this.graph.buildIndex();

    const warnings = [
      ...(resolvedSource.refScope === "cwd" ? validateRefs(refs, this.graph.projectRoot) : []),
      ...validateRelated(related, this.graph.fragments, resolvedSource),
    ];
    return { success: true, path: qualifiedPath, warnings };
  }

  update(path: string, updates: UpdateFragmentInput): MutationResult {
    const { alias, relPath } = parsePath(path);
    const resolvedSource = this.graph.sourceByAlias(alias);
    if (!resolvedSource) {
      return { success: false, error: `Unknown or unlinked source: "${alias}"` };
    }

    const normalizedRel = relPath.endsWith(".md") ? relPath : relPath + ".md";
    const qualifiedPath = qualifyPath(alias, normalizedRel);
    const filePath = join(resolvedSource.knowledgeDir, normalizedRel);

    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch {
      return { success: false, error: `Fragment not found at ${qualifiedPath}` };
    }

    const parsed = matter(raw);
    if (updates.tags !== undefined) parsed.data.tags = updates.tags;
    if (updates.related !== undefined) parsed.data.related = updates.related;
    if (updates.refs !== undefined) parsed.data.refs = updates.refs;

    const body = updates.content !== undefined ? updates.content : parsed.content;
    const fileContent = matter.stringify(body, parsed.data);
    writeFileSync(filePath, fileContent, "utf-8");
    this.graph.buildIndex();

    const warnings = [
      ...(updates.refs !== undefined && resolvedSource.refScope === "cwd"
        ? validateRefs(updates.refs, this.graph.projectRoot)
        : []),
      ...(updates.related !== undefined
        ? validateRelated(updates.related, this.graph.fragments, resolvedSource)
        : []),
    ];
    return { success: true, path: qualifiedPath, warnings };
  }

}
