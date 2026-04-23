import { z } from "zod";

import { DEFAULT_SEMANTIC_THRESHOLD, DEFAULT_SEMANTIC_TOP_K, DEFAULT_TAG_HOPS } from "../../constants.js";
import type { FragmentResult } from "../../types.js";
import { formatFull, writeQueryOutput } from "../format.js";
import type { ToolRegistrar } from "./context.js";

export const registerSearchTools: ToolRegistrar = (server, dctx) => {
  // ── search_knowledge ───────────────────────────────────────────
  server.tool(
    "search_knowledge",
    "Search knowledge fragments by tags with graph traversal. Returns raw fragment contents.",
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
    "Semantic search across knowledge fragments using embeddings. Supports natural language queries in any language.",
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

        if (output === "file") {
          const filePath = writeQueryOutput(
            ctx.outputRoot,
            results,
            (res) => `# Semantic Search: ${query}\n\nFound ${res.length} fragments.\n\n${formatFull(res)}`
          );
          return text(summary(filePath, results));
        }

        return text(`Found ${results.length} semantically similar fragments:\n\n${formatFull(results)}`);
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
