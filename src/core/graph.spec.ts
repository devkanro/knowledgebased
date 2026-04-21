import { test } from "node:test";
import assert from "node:assert/strict";

import { KnowledgeGraph } from "./graph.js";
import { makeFixture, makeExternalFixture } from "../test-utils.js";

test("buildIndex: indexes fragments and tags", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x", "y"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["y"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    assert.equal(graph.fragments.size, 2);
    assert.equal(graph.tagIndex.get("x")?.size, 1);
    assert.equal(graph.tagIndex.get("y")?.size, 2);
  } finally {
    fx.cleanup();
  }
});

test("buildIndex: builds bidirectional graph edges from related:", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"], related: ["b"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["y"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    assert.ok(graph.graphIndex.get("a.md")?.has("b.md"));
    assert.ok(graph.graphIndex.get("b.md")?.has("a.md"));
  } finally {
    fx.cleanup();
  }
});

test("searchByTags: respects hops parameter", () => {
  const fx = makeFixture();
  try {
    // a -[related]-> b -[related]-> c
    fx.writeFragment("a.md", { tags: ["seed"], related: ["b"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["mid"], related: ["c"] }, "# B\n");
    fx.writeFragment("c.md", { tags: ["leaf"] }, "# C\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const hop0 = graph.searchByTags(["seed"], 0).map((r) => r.path).sort();
    assert.deepEqual(hop0, ["a.md"]);

    const hop1 = graph.searchByTags(["seed"], 1).map((r) => r.path).sort();
    assert.deepEqual(hop1, ["a.md", "b.md"]);

    const hop2 = graph.searchByTags(["seed"], 2).map((r) => r.path).sort();
    assert.deepEqual(hop2, ["a.md", "b.md", "c.md"]);
  } finally {
    fx.cleanup();
  }
});

test("searchByTags: excludes nothing (all fragments active)", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["x"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const results = graph.searchByTags(["x"], 0).map((r) => r.path).sort();
    assert.deepEqual(results, ["a.md", "b.md"]);
  } finally {
    fx.cleanup();
  }
});

test("listTags: sorts by count desc", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["common", "rare"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["common"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const tags = graph.listTags();
    assert.deepEqual(tags, [
      { tag: "common", count: 2 },
      { tag: "rare", count: 1 },
    ]);
  } finally {
    fx.cleanup();
  }
});

test("getStats: counts total and tags", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["x"] }, "# B\n");
    fx.writeFragment("c.md", { tags: ["y"] }, "# C\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const stats = graph.getStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.tags, 2);
  } finally {
    fx.cleanup();
  }
});

// ─── Multi-source tests ─────────────────────────────────────────

test("multi-source: fragments from external KB get alias@ prefix", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("personal");
  try {
    fx.writeFragment("workflow/git.md", { tags: ["workflow"] }, "# Git\n");
    ext.writeFragment("tips/vim.md", { tags: ["vim"] }, "# Vim\n");

    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource()], fx.root);
    graph.buildIndex();

    assert.ok(graph.fragments.has("workflow/git.md"));
    assert.ok(graph.fragments.has("personal@tips/vim.md"));
    assert.equal(graph.fragments.size, 2);
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});

test("multi-source: search results include source alias", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("personal");
  try {
    fx.writeFragment("a.md", { tags: ["shared"] }, "# A\n");
    ext.writeFragment("b.md", { tags: ["shared"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource()], fx.root);
    graph.buildIndex();

    const results = graph.searchByTags(["shared"], 0);
    assert.equal(results.length, 2);
    const sources = results.map((r) => r.source).sort();
    assert.deepEqual(sources, ["personal", "repo"]);
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});

test("multi-source: related links resolve within same source only", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("personal");
  try {
    // repo has a.md -> b.md (within repo) — should link
    fx.writeFragment("a.md", { tags: ["x"], related: ["b"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["x"] }, "# B\n");
    // ext has c.md -> b (would match repo's b.md, but should NOT link across sources)
    ext.writeFragment("c.md", { tags: ["x"], related: ["b"] }, "# C\n");

    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource()], fx.root);
    graph.buildIndex();

    // repo a.md and b.md should be linked
    assert.ok(graph.graphIndex.get("a.md")?.has("b.md"));
    // ext c.md should NOT link to repo's b.md (no personal@b.md exists)
    assert.equal(graph.graphIndex.get("personal@c.md")?.size ?? 0, 0);
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});

test("multi-source: related with @ is silently skipped", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"], related: ["other@b"] }, "# A\n");
    fx.writeFragment("b.md", { tags: ["x"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    // The "other@b" related link should be ignored (no edge created)
    assert.equal(graph.graphIndex.get("a.md")?.size ?? 0, 0);
  } finally {
    fx.cleanup();
  }
});

test("multi-source: duplicate fragment path across sources logs warning and keeps first", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("repo"); // same alias as project!
  try {
    fx.writeFragment("a.md", { tags: ["first"] }, "# First\n");
    ext.writeFragment("a.md", { tags: ["second"] }, "# Second\n");

    // Both have alias "repo", so both produce bare "a.md" — dupe
    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource("repo")], fx.root);
    graph.buildIndex();

    assert.equal(graph.fragments.size, 1);
    assert.deepEqual(graph.fragments.get("a.md")?.tags, ["first"]); // first wins
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});

test("sourceOf: returns correct source for each fragment", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("personal");
  try {
    fx.writeFragment("a.md", { tags: ["x"] }, "# A\n");
    ext.writeFragment("b.md", { tags: ["x"] }, "# B\n");

    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource()], fx.root);
    graph.buildIndex();

    assert.equal(graph.sourceOf("a.md")?.alias, "repo");
    assert.equal(graph.sourceOf("personal@b.md")?.alias, "personal");
    assert.equal(graph.sourceOf("nonexistent"), undefined);
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});
