import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { formatFull, writeQueryOutput } from "./format.js";
import type { FragmentResult } from "../types.js";

const sample: FragmentResult[] = [
  {
    path: "workflow/naming.md",
    source: "repo",
    title: "Naming",
    tags: ["workflow", "git"],
    refs: ["src/x.ts"],
    content: "Use kebab-case.",
  },
  {
    path: "arch/layers.md",
    source: "repo",
    title: "Layers",
    tags: ["arch"],
    refs: [],
    content: "Three layers.",
  },
];

test("formatFull: includes path, tags, refs, content", () => {
  const out = formatFull(sample);
  assert.match(out, /## workflow\/naming\.md/);
  assert.match(out, /Tags: workflow, git/);
  assert.match(out, /Refs: src\/x\.ts/);
  assert.match(out, /Use kebab-case\./);
});

test("formatFull: omits Refs line when refs empty", () => {
  const out = formatFull([sample[1]]);
  assert.doesNotMatch(out, /Refs:/);
});

test("formatFull: separates entries with ---", () => {
  const out = formatFull(sample);
  assert.equal(out.split("\n---\n").length, 2);
});

test("writeQueryOutput: writes file under .copilot/knowledge-queries", () => {
  const root = mkdtempSync(join(tmpdir(), "kmcp-fmt-"));
  try {
    const filePath = writeQueryOutput(root, sample, formatFull);
    assert.match(filePath, /\.copilot\/knowledge-queries\/query-\d+-\w+\.md$/);
    assert.ok(existsSync(filePath));
    const body = readFileSync(filePath, "utf-8");
    assert.match(body, /## workflow\/naming\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
