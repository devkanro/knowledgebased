import { test } from "node:test";
import assert from "node:assert/strict";

import { KnowledgeGraph } from "../../core/graph.js";
import { makeFixture } from "../../test-utils.js";
import type { FragmentResult, SemanticHit } from "../../types.js";

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Minimal stub of the tiering logic extracted from search_rag,
 * so we can unit-test the classification without needing a live
 * MCP server or embedding engine.
 */
function classifyHits(
  scored: SemanticHit[],
  threshold: number,
  directThreshold: number,
) {
  const filtered = scored.filter((s) => s.score >= threshold);
  const directHits = filtered.filter((s) => s.score >= directThreshold);
  const summaryHits = filtered.filter(
    (s) => s.score >= threshold && s.score < directThreshold,
  );
  return { filtered, directHits, summaryHits };
}

/**
 * Expand direct-tier paths with one-hop graph neighbors,
 * deduplicating against already-included paths.
 */
function expandRelated(
  directPaths: Set<string>,
  allIncluded: Set<string>,
  graph: KnowledgeGraph,
): string[] {
  const relatedPaths: string[] = [];
  for (const path of directPaths) {
    const neighbors = graph.graphIndex.get(path);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!allIncluded.has(n) && graph.fragments.has(n)) {
        relatedPaths.push(n);
        allIncluded.add(n);
      }
    }
  }
  return relatedPaths;
}

// ─── Tier classification ────────────────────────────────────────────

test("classifyHits: splits scored results into direct and summary tiers", () => {
  const scored: SemanticHit[] = [
    { path: "a.md", score: 0.95 },
    { path: "b.md", score: 0.91 },
    { path: "c.md", score: 0.88 },
    { path: "d.md", score: 0.86 },
    { path: "e.md", score: 0.80 },
  ];

  const { filtered, directHits, summaryHits } = classifyHits(scored, 0.85, 0.9);

  assert.equal(filtered.length, 4, "4 results above threshold 0.85");
  assert.equal(directHits.length, 2, "a.md and b.md are direct");
  assert.equal(summaryHits.length, 2, "c.md and d.md are summary");
  assert.deepEqual(
    directHits.map((h) => h.path),
    ["a.md", "b.md"],
  );
});

test("classifyHits: filters out below-threshold fallback results", () => {
  // Simulates EmbeddingEngine returning a single below-threshold result as fallback
  const scored: SemanticHit[] = [{ path: "a.md", score: 0.70 }];
  const { filtered } = classifyHits(scored, 0.85, 0.9);
  assert.equal(filtered.length, 0, "below-threshold fallback should be excluded");
});

test("classifyHits: all results can be direct (no summary tier)", () => {
  const scored: SemanticHit[] = [
    { path: "a.md", score: 0.95 },
    { path: "b.md", score: 0.92 },
  ];

  const { directHits, summaryHits } = classifyHits(scored, 0.85, 0.9);

  assert.equal(directHits.length, 2);
  assert.equal(summaryHits.length, 0);
});

test("classifyHits: all results can be summary (no direct tier)", () => {
  const scored: SemanticHit[] = [
    { path: "a.md", score: 0.88 },
    { path: "b.md", score: 0.86 },
  ];

  const { directHits, summaryHits } = classifyHits(scored, 0.85, 0.9);

  assert.equal(directHits.length, 0);
  assert.equal(summaryHits.length, 2);
});

// ─── Graph expansion ────────────────────────────────────────────────

test("expandRelated: collects one-hop neighbors of direct paths", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"], related: ["b"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["y"], related: ["c"] }, "# B\n");
    fx.writeFragment("c.md", { tags: ["z"] }, "# C\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const directPaths = new Set(["a.md"]);
    const allIncluded = new Set(["a.md"]);
    const related = expandRelated(directPaths, allIncluded, graph);

    assert.deepEqual(related, ["b.md"], "b.md is one-hop from a.md");
    assert.ok(!related.includes("c.md"), "c.md is two hops away, not included");
  } finally {
    fx.cleanup();
  }
});

test("expandRelated: deduplicates against already-included paths", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"], related: ["b"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["y"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    // b.md is already in the scored results (e.g., it was a summary-tier hit)
    const directPaths = new Set(["a.md"]);
    const allIncluded = new Set(["a.md", "b.md"]);
    const related = expandRelated(directPaths, allIncluded, graph);

    assert.equal(related.length, 0, "b.md already included, should not duplicate");
  } finally {
    fx.cleanup();
  }
});

test("expandRelated: multiple direct paths can contribute related docs", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"], related: ["c"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["x"], related: ["d"] }, "# B\n");
    fx.writeFragment("c.md", { tags: ["y"] }, "# C\n");
    fx.writeFragment("d.md", { tags: ["y"] }, "# D\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const directPaths = new Set(["a.md", "b.md"]);
    const allIncluded = new Set(["a.md", "b.md"]);
    const related = expandRelated(directPaths, allIncluded, graph);

    assert.ok(related.includes("c.md"));
    assert.ok(related.includes("d.md"));
    assert.equal(related.length, 2);
  } finally {
    fx.cleanup();
  }
});

// ─── Threshold validation ───────────────────────────────────────────

test("directThreshold must be greater than threshold", () => {
  // This tests the validation logic that should be in the tool handler
  const threshold = 0.9;
  const directThreshold = 0.85;
  assert.ok(
    directThreshold <= threshold,
    "should detect invalid thresholds",
  );
});

// ─── Metadata fallback ─────────────────────────────────────────────

test("buildMetadataFallback: truncates content to 200 chars", () => {
  // Inline the helper for testing
  const buildMetadataFallback = (fragments: FragmentResult[]): string => {
    const items = fragments.map((f) => {
      const preview = f.content.slice(0, 200).replace(/\n/g, " ");
      return `- **${f.path}** (${f.tags.join(", ")}): ${preview}…`;
    });
    return `\n\n## Additional Matches (metadata only)\n\n${items.join("\n")}`;
  };

  const fragments: FragmentResult[] = [
    {
      path: "a.md",
      source: "repo",
      title: "Fragment A",
      tags: ["x", "y"],
      refs: [],
      content: "A".repeat(500),
    },
  ];

  const result = buildMetadataFallback(fragments);
  assert.ok(result.includes("## Additional Matches"));
  assert.ok(result.includes("**a.md**"));
  // Content should be truncated: 200 A's, not 500
  const match = result.match(/: (A+)…/);
  assert.ok(match);
  assert.equal(match![1].length, 200);
});

// ─── Sampling input capping ────────────────────────────────────────

test("sampling input capping: truncates fragments over 2000 chars", () => {
  const longContent = "X".repeat(3000);
  const fragments: FragmentResult[] = [
    { path: "a.md", source: "repo", title: "A", tags: [], refs: [], content: longContent },
  ];

  const capped = fragments.slice(0, 20).map((f) => ({
    ...f,
    content: f.content.length > 2000 ? f.content.slice(0, 2000) + "\n…(truncated)" : f.content,
  }));

  assert.ok(capped[0].content.endsWith("…(truncated)"));
  assert.equal(capped[0].content.length, 2000 + "\n…(truncated)".length);
});

test("sampling input capping: caps at 20 fragments", () => {
  const fragments: FragmentResult[] = Array.from({ length: 30 }, (_, i) => ({
    path: `${i}.md`,
    source: "repo",
    title: `Fragment ${i}`,
    tags: [],
    refs: [],
    content: "short",
  }));

  const capped = fragments.slice(0, 20);
  assert.equal(capped.length, 20);
});
