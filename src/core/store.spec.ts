import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { join } from "path";

import { KnowledgeGraph } from "./graph.js";
import { FragmentStore } from "./store.js";
import { makeFixture, makeExternalFixture } from "../test-utils.js";

function setup() {
  const fx = makeFixture();
  const graph = new KnowledgeGraph([fx.toSource()], fx.root);
  graph.buildIndex();
  const store = new FragmentStore(graph);
  return { fx, graph, store };
}

test("add: creates file, indexes it, returns success", () => {
  const { fx, graph, store } = setup();
  try {
    const result = store.add({
      path: "workflow/naming",
      title: "Branch naming",
      content: "Use kebab-case.",
      tags: ["workflow", "git"],
    });

    assert.equal(result.success, true);
    assert.equal(result.path, "workflow/naming.md");
    assert.deepEqual(result.warnings, []);
    assert.ok(existsSync(join(fx.knowledgeDir, "workflow/naming.md")));
    assert.ok(graph.fragments.has("workflow/naming.md"));
    assert.equal(graph.fragments.get("workflow/naming.md")?.title, "Branch naming");
  } finally {
    fx.cleanup();
  }
});

test("add: refuses duplicate path", () => {
  const { fx, store } = setup();
  try {
    store.add({ path: "x/y", title: "T", content: "c", tags: [] });
    const second = store.add({ path: "x/y", title: "T2", content: "c2", tags: [] });
    assert.equal(second.success, false);
    assert.match(second.error!, /already exists/);
  } finally {
    fx.cleanup();
  }
});

test("add: surfaces warnings for broken refs and related", () => {
  const { fx, store } = setup();
  try {
    const result = store.add({
      path: "x/y",
      title: "T",
      content: "c",
      tags: [],
      refs: ["src/missing.ts"],
      related: ["nonexistent"],
    });
    assert.equal(result.success, true);
    assert.equal(result.warnings?.length, 2);
  } finally {
    fx.cleanup();
  }
});

test("update: rewrites tags, preserves other fields", () => {
  const { fx, graph, store } = setup();
  try {
    store.add({ path: "x/y", title: "T", content: "body", tags: ["old"] });
    const result = store.update("x/y.md", { tags: ["new"] });

    assert.equal(result.success, true);
    const f = graph.fragments.get("x/y.md")!;
    assert.deepEqual(f.tags, ["new"]);
    assert.match(f.content, /body/);
  } finally {
    fx.cleanup();
  }
});

test("update: returns error when fragment missing", () => {
  const { fx, store } = setup();
  try {
    const result = store.update("does/not/exist.md", { tags: ["x"] });
    assert.equal(result.success, false);
    assert.match(result.error!, /not found/);
  } finally {
    fx.cleanup();
  }
});

// ─── Multi-source store tests ────────────────────────────────────

test("add: routes to external KB via @ prefix", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("personal");
  try {
    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource()], fx.root);
    graph.buildIndex();
    const store = new FragmentStore(graph);

    const result = store.add({
      path: "personal@tips/vim",
      title: "Vim tips",
      content: "Use :wq",
      tags: ["vim"],
    });

    assert.equal(result.success, true);
    assert.equal(result.path, "personal@tips/vim.md");
    assert.ok(existsSync(join(ext.knowledgeDir, "tips/vim.md")));
    assert.ok(graph.fragments.has("personal@tips/vim.md"));
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});

test("add: fails for unknown source alias", () => {
  const { fx, store } = setup();
  try {
    const result = store.add({
      path: "typo@tips/vim",
      title: "Vim tips",
      content: "Use :wq",
      tags: ["vim"],
    });
    assert.equal(result.success, false);
    assert.match(result.error!, /Unknown or unlinked source/);
  } finally {
    fx.cleanup();
  }
});

test("update: routes to external KB via @ prefix", () => {
  const fx = makeFixture();
  const ext = makeExternalFixture("personal");
  try {
    const graph = new KnowledgeGraph([fx.toSource(), ext.toSource()], fx.root);
    graph.buildIndex();
    const store = new FragmentStore(graph);

    store.add({ path: "personal@tips/vim", title: "Vim", content: "old", tags: ["vim"] });
    const result = store.update("personal@tips/vim.md", { content: "new content" });

    assert.equal(result.success, true);
    assert.match(graph.fragments.get("personal@tips/vim.md")?.content ?? "", /new content/);
  } finally {
    fx.cleanup();
    ext.cleanup();
  }
});
