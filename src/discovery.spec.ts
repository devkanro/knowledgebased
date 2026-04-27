import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { discoverKnowledge, discoverSources } from "./discovery.js";
import { makeFixture } from "./test-utils.js";

/** A guaranteed-nonexistent user-global config path (silences the real `~/.knowledgebased.json`). */
const NO_GLOBAL = join(tmpdir(), `kmcp-no-global-${Date.now()}-${Math.random()}.json`);

// ─── discoverKnowledge (legacy single-source) ───────────────────

test("discoverKnowledge: finds co-located knowledge/ in current dir", () => {
  const fx = makeFixture();
  try {
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, fx.knowledgeDir);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: walks up to find knowledge/ in parent", () => {
  const fx = makeFixture();
  try {
    const childDir = join(fx.root, "src", "deep");
    mkdirSync(childDir, { recursive: true });
    const result = discoverKnowledge(childDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, fx.knowledgeDir);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: returns null when nothing found anywhere", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    if (result) {
      assert.ok(!result.knowledgeDir.startsWith(fx.root));
    }
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: .knowledge.json takes precedence over knowledge/", () => {
  const fx = makeFixture();
  try {
    const altDir = join(fx.root, "elsewhere");
    mkdirSync(altDir, { recursive: true });
    writeFileSync(
      join(fx.root, ".knowledge.json"),
      JSON.stringify({ knowledge: "./elsewhere" }),
      "utf-8"
    );
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, altDir);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: resolves cacheDir relative to config file", () => {
  const fx = makeFixture();
  try {
    writeFileSync(
      join(fx.root, ".knowledge.json"),
      JSON.stringify({ cacheDir: "./.cache/embeddings" }),
      "utf-8"
    );
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    assert.ok(result);
    assert.ok(result.cacheDir?.endsWith("embeddings"));
    assert.ok(result.cacheDir?.startsWith(fx.root));
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: malformed .knowledge.json falls back to knowledge/", () => {
  const fx = makeFixture();
  try {
    writeFileSync(join(fx.root, ".knowledge.json"), "{ invalid json", "utf-8");
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, fx.knowledgeDir);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: finds hidden .knowledge/ directory", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const hidden = join(fx.root, ".knowledge");
    mkdirSync(hidden, { recursive: true });
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, hidden);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: visible knowledge/ wins over hidden .knowledge/ in same dir", () => {
  const fx = makeFixture();
  try {
    mkdirSync(join(fx.root, ".knowledge"), { recursive: true });
    const result = discoverKnowledge(fx.root, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, fx.knowledgeDir);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: finds sibling <name>.knowledge directory", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const projectDir = join(fx.root, "project");
    const siblingKb = join(fx.root, "project.knowledge");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(siblingKb, { recursive: true });

    const result = discoverKnowledge(projectDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, siblingKb);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: in-dir knowledge/ wins over sibling .knowledge", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const projectDir = join(fx.root, "project");
    const inDirKb = join(projectDir, "knowledge");
    const siblingKb = join(fx.root, "project.knowledge");
    mkdirSync(inDirKb, { recursive: true });
    mkdirSync(siblingKb, { recursive: true });

    const result = discoverKnowledge(projectDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, inDirKb);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: walks up checking sibling at each level", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const baz = join(fx.root, "foo", "bar", "baz");
    const ancestorKb = join(fx.root, "foo.knowledge");
    mkdirSync(baz, { recursive: true });
    mkdirSync(ancestorKb, { recursive: true });

    const result = discoverKnowledge(baz, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, ancestorKb);
  } finally {
    fx.cleanup();
  }
});

// ─── Git root boundary ──────────────────────────────────────────

test("discoverKnowledge: knowledge/ beyond git root is ignored", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    // Create a git repo at fx.root/repo
    const repoDir = join(fx.root, "repo");
    const srcDir = join(repoDir, "src");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    mkdirSync(srcDir, { recursive: true });

    // Place knowledge/ outside git root (at fx.root level)
    const outsideKb = join(fx.root, "knowledge");
    mkdirSync(outsideKb, { recursive: true });

    const result = discoverKnowledge(srcDir, NO_GLOBAL);
    // Should NOT find the knowledge/ outside git root
    if (result) {
      assert.notEqual(result.knowledgeDir, outsideKb);
    }
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: .knowledge/ beyond git root is ignored", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const repoDir = join(fx.root, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });

    // Place .knowledge/ outside git root
    const outsideKb = join(fx.root, ".knowledge");
    mkdirSync(outsideKb, { recursive: true });

    const result = discoverKnowledge(repoDir, NO_GLOBAL);
    if (result) {
      assert.notEqual(result.knowledgeDir, outsideKb);
    }
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: sibling .knowledge/ works beyond git root", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const repoDir = join(fx.root, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });

    // Sibling pattern at parent level (outside git root)
    const siblingKb = join(fx.root, "repo.knowledge");
    mkdirSync(siblingKb, { recursive: true });

    const result = discoverKnowledge(repoDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, siblingKb);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: .knowledge.json works beyond git root", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const repoDir = join(fx.root, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });

    // Place a config file and target dir outside git root
    const externalKb = join(fx.root, "shared-kb");
    mkdirSync(externalKb, { recursive: true });
    writeFileSync(
      join(fx.root, ".knowledge.json"),
      JSON.stringify({ knowledge: "./shared-kb" }),
      "utf-8"
    );

    const result = discoverKnowledge(repoDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, externalKb);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: knowledge/ inside git root still works", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const repoDir = join(fx.root, "repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });

    const inRepoKb = join(repoDir, "knowledge");
    mkdirSync(inRepoKb, { recursive: true });

    const result = discoverKnowledge(repoDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, inRepoKb);
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: no git root — knowledge/ is NOT matched (too generic)", () => {
  const fx = makeFixture({ withKnowledgeDir: false, withGit: false });
  try {
    // No .git anywhere in fixture
    const childDir = join(fx.root, "deep", "nested");
    mkdirSync(childDir, { recursive: true });

    // Place knowledge/ at fx.root level — should be ignored without git root
    const kb = join(fx.root, "knowledge");
    mkdirSync(kb, { recursive: true });

    const result = discoverKnowledge(childDir, NO_GLOBAL);
    if (result) {
      assert.notEqual(result.knowledgeDir, kb, "knowledge/ should not be found without git root");
    }
  } finally {
    fx.cleanup();
  }
});

test("discoverKnowledge: no git root — sibling pattern still works", () => {
  const fx = makeFixture({ withKnowledgeDir: false, withGit: false });
  try {
    const projectDir = join(fx.root, "my-project");
    const siblingKb = join(fx.root, "my-project.knowledge");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(siblingKb, { recursive: true });

    const result = discoverKnowledge(projectDir, NO_GLOBAL);
    assert.ok(result);
    assert.equal(result.knowledgeDir, siblingKb);
  } finally {
    fx.cleanup();
  }
});

// ─── discoverSources (multi-source) ─────────────────────────────

test("discoverSources: returns repo source with alias 'repo'", () => {
  const fx = makeFixture();
  try {
    const sources = discoverSources(fx.root, NO_GLOBAL);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].alias, "repo");
    assert.equal(sources[0].knowledgeDir, fx.knowledgeDir);
    assert.equal(sources[0].refScope, "cwd");
  } finally {
    fx.cleanup();
  }
});

test("discoverSources: returns empty array when nothing found", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  try {
    const sources = discoverSources(fx.root, NO_GLOBAL);
    // Might find something from dev box ancestor; tolerate if outside fixture
    for (const s of sources) {
      assert.ok(!s.knowledgeDir.startsWith(fx.root));
    }
  } finally {
    fx.cleanup();
  }
});

test("discoverSources: loads global KB via wildcard match", () => {
  const fx = makeFixture();
  const globalHome = mkdtempSync(join(tmpdir(), "kmcp-home-"));
  const globalConfig = join(globalHome, ".knowledgebased.json");
  const personalKb = join(globalHome, "personal-notes");
  try {
    mkdirSync(personalKb, { recursive: true });
    writeFileSync(
      globalConfig,
      JSON.stringify({
        bases: { personal: personalKb },
        repos: { "*": ["personal"] },
      }),
      "utf-8"
    );

    const sources = discoverSources(fx.root, globalConfig);
    assert.ok(sources.length >= 2); // repo + personal
    const personal = sources.find((s) => s.alias === "personal");
    assert.ok(personal);
    assert.equal(personal.knowledgeDir, personalKb);
    assert.equal(personal.refScope, "unscoped");
  } finally {
    fx.cleanup();
    rmSync(globalHome, { recursive: true, force: true });
  }
});

test("discoverSources: loads global KB via repo path match", () => {
  const fx = makeFixture();
  const globalHome = mkdtempSync(join(tmpdir(), "kmcp-home-"));
  const globalConfig = join(globalHome, ".knowledgebased.json");
  const teamKb = join(globalHome, "team-notes");
  try {
    mkdirSync(teamKb, { recursive: true });
    writeFileSync(
      globalConfig,
      JSON.stringify({
        bases: { team: teamKb },
        repos: { [fx.root]: ["team"] },
      }),
      "utf-8"
    );

    const sources = discoverSources(fx.root, globalConfig);
    const team = sources.find((s) => s.alias === "team");
    assert.ok(team);
    assert.equal(team.knowledgeDir, teamKb);
  } finally {
    fx.cleanup();
    rmSync(globalHome, { recursive: true, force: true });
  }
});

test("discoverSources: throws on unknown base ID in repos", () => {
  const fx = makeFixture();
  const globalHome = mkdtempSync(join(tmpdir(), "kmcp-home-"));
  const globalConfig = join(globalHome, ".knowledgebased.json");
  try {
    writeFileSync(
      globalConfig,
      JSON.stringify({
        bases: {},
        repos: { "*": ["nonexistent"] },
      }),
      "utf-8"
    );

    assert.throws(
      () => discoverSources(fx.root, globalConfig),
      /unknown base "nonexistent"/
    );
  } finally {
    fx.cleanup();
    rmSync(globalHome, { recursive: true, force: true });
  }
});

test("discoverSources: throws on invalid base ID with @", () => {
  const fx = makeFixture();
  const globalHome = mkdtempSync(join(tmpdir(), "kmcp-home-"));
  const globalConfig = join(globalHome, ".knowledgebased.json");
  try {
    writeFileSync(
      globalConfig,
      JSON.stringify({
        bases: { "bad@id": "/tmp" },
        repos: {},
      }),
      "utf-8"
    );

    assert.throws(
      () => discoverSources(fx.root, globalConfig),
      /must not contain @/
    );
  } finally {
    fx.cleanup();
    rmSync(globalHome, { recursive: true, force: true });
  }
});

test("discoverSources: throws on duplicate canonical knowledgeDir", () => {
  const fx = makeFixture();
  const globalHome = mkdtempSync(join(tmpdir(), "kmcp-home-"));
  const globalConfig = join(globalHome, ".knowledgebased.json");
  try {
    // Point a base to the same dir as the project source
    writeFileSync(
      globalConfig,
      JSON.stringify({
        bases: { dupe: fx.knowledgeDir },
        repos: { "*": ["dupe"] },
      }),
      "utf-8"
    );

    assert.throws(
      () => discoverSources(fx.root, globalConfig),
      /Duplicate knowledge directory/
    );
  } finally {
    fx.cleanup();
    rmSync(globalHome, { recursive: true, force: true });
  }
});

test("discoverSources: longest-prefix wins for nested repo entries", () => {
  const fx = makeFixture({ withKnowledgeDir: false });
  const globalHome = mkdtempSync(join(tmpdir(), "kmcp-home-"));
  const globalConfig = join(globalHome, ".knowledgebased.json");
  const parentKb = join(globalHome, "parent-kb");
  const childKb = join(globalHome, "child-kb");
  try {
    mkdirSync(parentKb, { recursive: true });
    mkdirSync(childKb, { recursive: true });

    const childDir = join(fx.root, "child");
    mkdirSync(childDir, { recursive: true });

    writeFileSync(
      globalConfig,
      JSON.stringify({
        bases: { parent: parentKb, child: childKb },
        repos: {
          [fx.root]: ["parent"],
          [childDir]: ["child"],
        },
      }),
      "utf-8"
    );

    // From childDir: only child wins (longest prefix), not parent
    const sources = discoverSources(childDir, globalConfig);
    const aliases = sources.map((s) => s.alias);
    assert.ok(aliases.includes("child"));
    assert.ok(!aliases.includes("parent"));
  } finally {
    fx.cleanup();
    rmSync(globalHome, { recursive: true, force: true });
  }
});
