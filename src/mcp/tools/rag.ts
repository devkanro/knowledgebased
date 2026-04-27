import { z } from "zod";

import {
  DEFAULT_RAG_DIRECT_THRESHOLD,
  DEFAULT_RAG_SUMMARY_MAX_TOKENS,
  DEFAULT_RAG_THRESHOLD,
} from "../../constants.js";
import type { FragmentResult, SemanticHit } from "../../types.js";
import { formatFull } from "../format.js";
import { isSamplingAvailable, summarizeFragments } from "../sampling.js";
import type { ToolRegistrar } from "./context.js";

/** Tier label used in the references table. */
type Tier = "direct" | "related" | "summarized" | "metadata-only";

interface Reference {
  path: string;
  score: number | null;
  tier: Tier;
  reason: string;
}

export const registerRagTools: ToolRegistrar = (server, dctx) => {
  server.tool(
    "search_rag",
    "Semantic search with automatic summarization. High-confidence results are returned verbatim; " +
      "lower-confidence and related documents are synthesized into a query-aware summary via LLM sampling.",
    {
      query: z.string().describe("Natural language search query"),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(DEFAULT_RAG_THRESHOLD)
        .describe(`Minimum similarity score for inclusion (default: ${DEFAULT_RAG_THRESHOLD})`),
      directThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(DEFAULT_RAG_DIRECT_THRESHOLD)
        .describe(`Score above which fragments are returned verbatim (default: ${DEFAULT_RAG_DIRECT_THRESHOLD})`),
      maxTokens: z
        .number()
        .int()
        .min(50)
        .optional()
        .default(DEFAULT_RAG_SUMMARY_MAX_TOKENS)
        .describe(`Max tokens for the sampling summary (default: ${DEFAULT_RAG_SUMMARY_MAX_TOKENS})`),
    },
    async ({ query, threshold, directThreshold, maxTokens }) => {
      if (directThreshold <= threshold) {
        return text(
          `Invalid thresholds: directThreshold (${directThreshold}) must be greater than threshold (${threshold}).`
        );
      }

      const ctx = await dctx.waitForInit();

      // ── 1. Semantic search — get ALL candidates above the lower threshold ──
      let scored: SemanticHit[];
      try {
        scored = await ctx.embeddings.search(query, 100, threshold);
      } catch (e) {
        return text(
          `Semantic search unavailable: ${(e as Error).message}. Embedding engine may still be initializing.`
        );
      }

      // The embedding engine may return a below-threshold fallback result
      // when nothing meets the threshold. Filter those out for RAG.
      scored = scored.filter((s) => s.score >= threshold);

      if (scored.length === 0) {
        return text(`No fragments found for: ${query}`);
      }

      // Build a score lookup
      const scoreMap = new Map(scored.map((s) => [s.path, s.score]));

      // ── 2. Split into tiers ────────────────────────────────────────
      const directHits = scored.filter((s) => s.score >= directThreshold);
      const summaryHits = scored.filter(
        (s) => s.score >= threshold && s.score < directThreshold
      );

      // ── 3. Expand direct hits with one-hop related docs ───────────
      const directPaths = new Set(directHits.map((h) => h.path));
      const allIncluded = new Set(scored.map((s) => s.path));
      const relatedPaths: string[] = [];

      for (const path of directPaths) {
        const neighbors = ctx.graph.graphIndex.get(path);
        if (!neighbors) continue;
        for (const n of neighbors) {
          if (!allIncluded.has(n) && ctx.graph.fragments.has(n)) {
            relatedPaths.push(n);
            allIncluded.add(n); // deduplicate
          }
        }
      }

      // ── 4. Resolve fragments ──────────────────────────────────────
      const resolve = (path: string): FragmentResult | null => {
        const f = ctx.graph.fragments.get(path);
        if (!f) return null;
        const source = ctx.graph.sourceOf(path);
        return {
          path,
          source: source?.alias ?? "repo",
          title: f.title,
          tags: f.tags,
          refs: f.refs,
          content: f.content,
        };
      };

      const directFragments = directHits
        .map((h) => resolve(h.path))
        .filter((r): r is FragmentResult => r !== null);

      const relatedFragments = relatedPaths
        .map((p) => resolve(p))
        .filter((r): r is FragmentResult => r !== null);

      const summaryFragments = summaryHits
        .map((h) => resolve(h.path))
        .filter((r): r is FragmentResult => r !== null);

      // ── 5. Build direct references ─────────────────────────────────
      const refs: Reference[] = [];

      for (const f of directFragments) {
        const parentPath = f.path;
        const expandedCount = relatedPaths.filter((rp) => {
          const neighbors = ctx.graph.graphIndex.get(parentPath);
          return neighbors?.has(rp);
        }).length;
        const reason =
          expandedCount > 0
            ? `Score ≥ ${directThreshold}, expanded ${expandedCount} related`
            : `Score ≥ ${directThreshold}`;
        refs.push({ path: f.path, score: scoreMap.get(f.path) ?? null, tier: "direct", reason });
      }

      // ── 6. Sampling / fallback ────────────────────────────────────
      const toSummarize = [...relatedFragments, ...summaryFragments];
      const canSample = isSamplingAvailable(server);

      // Cap sampling input: at most 20 fragments, truncate each to 2000 chars
      const cappedSummarize = toSummarize.slice(0, 20).map((f) => ({
        ...f,
        content: f.content.length > 2000 ? f.content.slice(0, 2000) + "\n…(truncated)" : f.content,
      }));

      let summarySection = "";
      let samplingSucceeded = false;

      if (cappedSummarize.length > 0 && canSample) {
        const summary = await summarizeFragments(server, query, cappedSummarize, maxTokens);
        if (summary) {
          summarySection = `\n\n## Summary\n\n${summary}`;
          samplingSucceeded = true;
        }
      }

      if (cappedSummarize.length > 0 && !samplingSucceeded) {
        summarySection = buildMetadataFallback(toSummarize);
      }

      // ── 7. Finalize non-direct references (after sampling outcome) ─
      for (const f of summaryFragments) {
        refs.push({
          path: f.path,
          score: scoreMap.get(f.path) ?? null,
          tier: samplingSucceeded ? "summarized" : "metadata-only",
          reason: samplingSucceeded
            ? `Score ${threshold}–${directThreshold}, included in summary`
            : `Score ${threshold}–${directThreshold}, sampling unavailable`,
        });
      }

      for (const p of relatedPaths) {
        let linkedFrom = "";
        for (const dp of directPaths) {
          if (ctx.graph.graphIndex.get(dp)?.has(p)) {
            linkedFrom = dp;
            break;
          }
        }
        refs.push({
          path: p,
          score: scoreMap.get(p) ?? null,
          tier: samplingSucceeded ? "related" : "metadata-only",
          reason: samplingSucceeded
            ? `Related to ${linkedFrom}, included in summary`
            : `Related to ${linkedFrom}, sampling unavailable`,
        });
      }

      // ── 8. Compose final response ─────────────────────────────────
      const refLines = refs.map(
        (r) =>
          `| ${r.path} | ${r.score !== null ? r.score.toFixed(3) : "—"} | ${r.tier} | ${r.reason} |`
      );
      const refsTable = [
        "## References\n",
        "| Fragment | Score | Tier | Reason |",
        "|----------|-------|------|--------|",
        ...refLines,
      ].join("\n");

      let directSection = "";
      if (directFragments.length > 0) {
        directSection = `\n\n## Direct Results\n\n${formatFull(directFragments)}`;
      }

      const body = `${refsTable}${directSection}${summarySection}`;
      return text(body);
    }
  );
};

function buildMetadataFallback(fragments: FragmentResult[]): string {
  const items = fragments.map((f) => {
    const preview = f.content.slice(0, 200).replace(/\n/g, " ");
    return `- **${f.path}** (${f.tags.join(", ")}): ${preview}…`;
  });
  return `\n\n## Additional Matches (metadata only)\n\n${items.join("\n")}`;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}
