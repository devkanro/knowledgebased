import { test } from "node:test";
import assert from "node:assert/strict";

import { extractTitle, parseFragmentFile, walkDir } from "./loader.js";
import { makeFixture } from "../test-utils.js";

test("extractTitle: returns first H1", () => {
  assert.equal(extractTitle("# Hello\n\ncontent"), "Hello");
  assert.equal(extractTitle("intro\n# Real Title\n# Second"), "Real Title");
});

test("extractTitle: returns '(untitled)' when no H1", () => {
  assert.equal(extractTitle("just body"), "(untitled)");
  assert.equal(extractTitle("## subhead only"), "(untitled)");
});

test("walkDir: lists files recursively", () => {
  const fx = makeFixture();
  try {
    fx.writeFragment("a.md", { tags: ["x"] }, "# A\n");
    fx.writeFragment("sub/b.md", { tags: ["y"] }, "# B\n");
    const files = walkDir(fx.knowledgeDir);
    assert.equal(files.length, 2);
    assert.ok(files.some((f) => f.endsWith("a.md")));
    assert.ok(files.some((f) => f.endsWith("b.md")));
  } finally {
    fx.cleanup();
  }
});

test("walkDir: returns [] when dir missing", () => {
  assert.deepEqual(walkDir("/this/path/does/not/exist/anywhere"), []);
});

test("parseFragmentFile: parses frontmatter + extracts title", () => {
  const fx = makeFixture();
  try {
    const abs = fx.writeFragment(
      "workflow/foo.md",
      { tags: ["a", "b"], related: ["other"], refs: ["src/x.ts"] },
      "# My Title\n\nbody text"
    );
    const result = parseFragmentFile(abs, fx.knowledgeDir);
    assert.ok(result);
    assert.equal(result.relPath, "workflow/foo.md");
    assert.deepEqual(result.fragment.tags, ["a", "b"]);
    assert.deepEqual(result.fragment.related, ["other"]);
    assert.equal(result.fragment.title, "My Title");
    assert.match(result.fragment.content, /body text/);
  } finally {
    fx.cleanup();
  }
});

test("parseFragmentFile: defaults missing frontmatter fields", () => {
  const fx = makeFixture();
  try {
    const abs = fx.writeFragment("a.md", {}, "# T\n");
    const result = parseFragmentFile(abs, fx.knowledgeDir);
    assert.ok(result);
    assert.deepEqual(result.fragment.tags, []);
    assert.deepEqual(result.fragment.related, []);
    assert.equal(result.fragment.source, null);
  } finally {
    fx.cleanup();
  }
});

test("parseFragmentFile: returns null for unreadable file", () => {
  const fx = makeFixture();
  try {
    const result = parseFragmentFile("/nonexistent/path.md", fx.knowledgeDir);
    assert.equal(result, null);
  } finally {
    fx.cleanup();
  }
});
