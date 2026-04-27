import { test } from "node:test";
import assert from "node:assert/strict";

import { BM25Engine, tokenize } from "./bm25.js";
import { KnowledgeGraph } from "../core/graph.js";
import { makeFixture } from "../test-utils.js";

// ─── Tokenizer ──────────────────────────────────────────────────

test("tokenize: splits on non-alphanumeric, preserves underscores", () => {
  const tokens = tokenize("WM_DISPLAYCHANGE is a Win32 message");
  assert.ok(tokens.includes("wm_displaychange"));
  assert.ok(tokens.includes("win32"));
  assert.ok(tokens.includes("message"));
});

test("tokenize: lowercases and filters short tokens", () => {
  const tokens = tokenize("A Big Cat");
  assert.ok(!tokens.includes("a"), "single char filtered");
  assert.ok(tokens.includes("big"));
  assert.ok(tokens.includes("cat"));
});

test("tokenize: handles empty and whitespace-only input", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("   "), []);
});

// ─── BM25 scoring ──────────────────────────────────────────────

test("BM25: rare terms score higher than common terms", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("common.md", { tags: ["test"] }, "# Common\nThe color settings page handles color changes.\n");
    fx.writeFragment("rare.md", { tags: ["test"] }, "# Rare\nHandle WM_DISPLAYCHANGE for monitor hotplug events.\n");
    fx.writeFragment("both.md", { tags: ["test"] }, "# Both\nColor and WM_DISPLAYCHANGE are used together.\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const bm25 = new BM25Engine();
    bm25.buildIndex(graph);

    const scores = bm25.score("WM_DISPLAYCHANGE hotplug");

    const rareScore = scores.get("rare.md") ?? 0;
    const commonScore = scores.get("common.md") ?? 0;
    const bothScore = scores.get("both.md") ?? 0;

    assert.ok(rareScore > commonScore, "rare.md should score higher than common.md");
    assert.ok(rareScore > 0, "rare.md should have a positive score");
    assert.ok(bothScore > commonScore, "both.md should score higher than common.md");
  } finally {
    fx.cleanup();
  }
});

test("BM25: title boost gives extra weight to title matches", () => {
  const fx = makeFixture();
  try {
    // "hotplug" in title vs only in body
    fx.writeFragment("title-match.md", { tags: ["test"] }, "# Monitor Hotplug\nSome other content here.\n");
    fx.writeFragment("body-match.md", { tags: ["test"] }, "# Some Title\nMonitor hotplug handling is done here.\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const bm25 = new BM25Engine();
    bm25.buildIndex(graph);

    const scores = bm25.score("hotplug");

    const titleScore = scores.get("title-match.md") ?? 0;
    const bodyScore = scores.get("body-match.md") ?? 0;

    assert.ok(titleScore > bodyScore, "title match should score higher due to title boost");
  } finally {
    fx.cleanup();
  }
});

test("BM25: query with no matching terms returns empty scores", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("doc.md", { tags: ["test"] }, "# Document\nSome content about widgets.\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const bm25 = new BM25Engine();
    bm25.buildIndex(graph);

    const scores = bm25.score("xyznonexistentterm");
    assert.equal(scores.size, 0);
  } finally {
    fx.cleanup();
  }
});

test("BM25: empty graph returns empty scores", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const graph = new KnowledgeGraph([], fx.root);
    graph.buildIndex();

    const bm25 = new BM25Engine();
    bm25.buildIndex(graph);

    const scores = bm25.score("anything");
    assert.equal(scores.size, 0);
  } finally {
    fx.cleanup();
  }
});

test("BM25: IDF gives low score to terms appearing in all documents", () => {
  const fx = makeFixture();
  try {
    // "common" appears in all 3 docs, "unique" only in one
    fx.writeFragment("a.md", { tags: ["test"] }, "# A\nThis is common content.\n");
    fx.writeFragment("b.md", { tags: ["test"] }, "# B\nThis is common content.\n");
    fx.writeFragment("c.md", { tags: ["test"] }, "# C\nThis is common and unique content.\n");

    const graph = new KnowledgeGraph([fx.toSource()], fx.root);
    graph.buildIndex();

    const bm25 = new BM25Engine();
    bm25.buildIndex(graph);

    const commonScores = bm25.score("common");
    const uniqueScores = bm25.score("unique");

    // "unique" only in c.md → higher IDF → higher score for c.md
    const cUnique = uniqueScores.get("c.md") ?? 0;
    const cCommon = commonScores.get("c.md") ?? 0;

    assert.ok(cUnique > cCommon, "rare term 'unique' should score higher than ubiquitous 'common'");
  } finally {
    fx.cleanup();
  }
});
