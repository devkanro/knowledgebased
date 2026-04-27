import { z } from "zod";

import { DEFAULT_SEMANTIC_THRESHOLD, DEFAULT_SEMANTIC_TOP_K, DEFAULT_TAG_HOPS } from "../../constants.js";
import type { FragmentResult } from "../../types.js";
import { formatFull, writeQueryOutput } from "../format.js";
import type { ToolRegistrar } from "./context.js";

export const registerSearchTools: ToolRegistrar = (server, dctx) => {
  // ── search_knowledge ───────────────────────────────────────────
  server.tool(
    "search_knowledge",
    "Search knowledge fragments by tags with graph traversal. Returns raw fragment contents.\n\n" +
      "Use this when you know the exact tags and need full, unabridged content for a specific domain. " +
      "Prefer search_rag over this for answering questions (it summarizes automatically). " +
      "Prefer search_semantic over this for exploring what the knowledge base covers.",
    {
      tags: z.array(z.string()).describe("Tags to search for"),
      hops: z
        .number()
        .optional()
        .default(DEFAULT_TAG_HOPS)
        .describe(`Number of graph hops to follow related links (default: ${DEFAULT_TAG_HOPS})`),
      output: z
        .enum(["inline", "file"])
        .optional()
        .default("inline")
        .describe("'inline' returns results in response. 'file' writes to a temp file and returns the path."),
    },
    async ({ tags, hops, output }) => {
      const ctx = await dctx.waitForInit();
      const results = ctx.graph.searchByTags(tags, hops);
      if (results.length === 0) {
        return text(`No fragments found for tags: ${tags.join(", ")}`);
      }

      if (output === "file") {
        try {
          const filePath = writeQueryOutput(
            ctx.outputRoot,
            results,
            (res) => `# Tag Search: ${tags.join(", ")}\n\nFound ${res.length} fragments.\n\n${formatFull(res)}`
          );
          return text(summary(filePath, results));
        } catch (e) {
          return text(
            `Failed to write query output: ${(e as Error).message}. Returning inline instead.\n\n${formatFull(results)}`
          );
        }
      }

      return text(`Found ${results.length} fragments:\n\n${formatFull(results)}`);
    }
  );

  // ── search_semantic ────────────────────────────────────────────
  server.tool(
    "search_semantic",
    "Semantic search across knowledge fragments using embeddings. Supports natural language queries in any language.\n\n" +
      "Use this for exploring what the knowledge base covers or when you need raw fragment content with similarity scores. " +
      "Prefer search_rag over this for answering user questions (it automatically summarizes lower-confidence results).",
    {
      query: z.string().describe("Natural language search query"),
      topK: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(DEFAULT_SEMANTIC_TOP_K)
        .describe(`Max results to return (default: ${DEFAULT_SEMANTIC_TOP_K})`),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(DEFAULT_SEMANTIC_THRESHOLD)
        .describe(`Minimum similarity score (0-1). Default: ${DEFAULT_SEMANTIC_THRESHOLD}`),
      output: z.enum(["inline", "file"]).optional().default("inline").describe("'inline' or 'file'"),
    },
    async ({ query, topK, threshold, output }) => {
      const ctx = await dctx.waitForInit();
      try {
        const scored = await ctx.embeddings.search(query, topK, threshold);
        if (scored.length === 0) {
          return text(`No semantically similar fragments found for: ${query}`);
        }

        // Build score lookups for the references table
        const hitMap = new Map(scored.map((s) => [s.path, s]));

        const results: FragmentResult[] = scored
          .map((s) => {
            const f = ctx.graph.fragments.get(s.path);
            if (!f) return null;
            const source = ctx.graph.sourceOf(s.path);
            return {
              path: s.path,
              source: source?.alias ?? "repo",
              title: f.title,
              tags: f.tags,
              refs: f.refs,
              content: f.content,
            } satisfies FragmentResult;
          })
          .filter((r): r is FragmentResult => r !== null);

        const refLines = results.map(
          (r) => {
            const hit = hitMap.get(r.path);
            const score = hit?.score ?? 0;
            const cosine = hit?.cosine ?? 0;
            const bm25 = hit?.bm25 ?? 0;
            return `| ${r.path} | ${score.toFixed(3)} | ${cosine.toFixed(3)} | ${bm25.toFixed(1)} | ${r.source} |`;
          }
        );
        const refsTable = [
          "## References\n",
          "| Fragment | Score | Cosine | BM25 | Source |",
          "|----------|-------|--------|------|--------|",
          ...refLines,
        ].join("\n");

        if (output === "file") {
          const filePath = writeQueryOutput(
            ctx.outputRoot,
            results,
            (res) => `# Semantic Search: ${query}\n\n${refsTable}\n\n${formatFull(res)}`
          );
          return text(summary(filePath, results));
        }

        return text(`${refsTable}\n\n${formatFull(results)}`);
      } catch (e) {
        return text(
          `Semantic search unavailable: ${(e as Error).message}. Embedding engine may still be initializing.`
        );
      }
    }
  );
};

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function summary(filePath: string, results: FragmentResult[]): string {
  const top = results.slice(0, 3).map((r) => r.title).join(", ");
  return `Results written to: ${filePath}\nFragments: ${results.length}\nTop matches: ${top}`;
}
