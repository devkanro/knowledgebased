import { test } from "node:test";
import assert from "node:assert/strict";

import { validateRefs, validateRelated } from "./validator.js";
import { makeFixture } from "../test-utils.js";
import type { Fragment } from "../types.js";

test("validateRefs: ok when file exists and symbol present", () => {
  const fx = makeFixture();
  try {
    fx.writeFile("src/utils.ts", "export function parseArgs() {}\n");
    const warnings = validateRefs(["src/utils.ts::parseArgs"], fx.root);
    assert.deepEqual(warnings, []);
  } finally {
    fx.cleanup();
  }
});

test("validateRefs: warns on missing file", () => {
  const fx = makeFixture();
  try {
    const warnings = validateRefs(["src/missing.ts"], fx.root);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /file not found/);
  } finally {
    fx.cleanup();
  }
});

test("validateRefs: warns on missing symbol", () => {
  const fx = makeFixture();
  try {
    fx.writeFile("src/utils.ts", "export function parseArgs() {}\n");
    const warnings = validateRefs(["src/utils.ts::otherSymbol"], fx.root);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"otherSymbol" not found/);
  } finally {
    fx.cleanup();
  }
});

test("validateRefs: warns on path escape", () => {
  const fx = makeFixture();
  try {
    const warnings = validateRefs(["../outside.ts"], fx.root);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /escapes project root/);
  } finally {
    fx.cleanup();
  }
});

test("validateRelated: ok when fragment exists", () => {
  const fragments = new Map<string, Fragment>();
  fragments.set("workflow/foo.md", {} as Fragment);
  assert.deepEqual(validateRelated(["workflow/foo"], fragments), []);
  assert.deepEqual(validateRelated(["workflow/foo.md"], fragments), []);
});

test("validateRelated: warns when fragment missing", () => {
  const fragments = new Map<string, Fragment>();
  const warnings = validateRelated(["workflow/missing"], fragments);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /fragment not found/);
});

test("validateRelated: rejects cross-source references with @", () => {
  const fragments = new Map<string, Fragment>();
  fragments.set("personal@workflow/foo.md", {} as Fragment);
  const warnings = validateRelated(["personal@workflow/foo"], fragments);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cross-source references.*forbidden/);
});
