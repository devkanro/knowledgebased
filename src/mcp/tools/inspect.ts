import { validateRefs, validateRelated } from "../../core/validator.js";
import type { ToolRegistrar } from "./context.js";

export const registerInspectTools: ToolRegistrar = (server, dctx) => {
  // ── list_tags ──────────────────────────────────────────────────
  server.tool("list_tags", "List all available knowledge tags with fragment counts.", {}, async () => {
    const ctx = await dctx.waitForInit();
    const tags = ctx.graph.listTags();
    if (tags.length === 0) {
      return text("No tags found. Knowledge directory may be empty.");
    }
    const body = tags.map((t) => `- \`${t.tag}\` (${t.count})`).join("\n");
    const stats = ctx.graph.getStats();
    return text(
      `Knowledge stats: ${stats.total} fragments, ${stats.tags} tags\n\n${body}`
    );
  });

  // ── audit_knowledge ────────────────────────────────────────────
  server.tool("audit_knowledge", "Validate all knowledge fragments for broken refs and related links.", {}, async () => {
    const ctx = await dctx.waitForInit();
    ctx.graph.buildIndex();
    const issues: string[] = [];
    let brokenRefs = 0;
    let brokenRelated = 0;
    let unscopedRefs = 0;

    for (const [path, fragment] of ctx.graph.fragments) {
      const source = ctx.graph.sourceOf(path);

      // refs validation: skip for "unscoped" sources (external KBs)
      let refWarnings: string[];
      if (source?.refScope === "unscoped") {
        const count = fragment.refs.length;
        if (count > 0) unscopedRefs += count;
        refWarnings = [];
      } else {
        refWarnings = validateRefs(fragment.refs, ctx.graph.projectRoot);
      }

      const relWarnings = validateRelated(fragment.related, ctx.graph.fragments, source);

      if (refWarnings.length > 0 || relWarnings.length > 0) {
        issues.push(`  ${path}\n${[...refWarnings, ...relWarnings].map((w) => `    ${w}`).join("\n")}`);
        brokenRefs += refWarnings.length;
        brokenRelated += relWarnings.length;
      }
    }

    const stats = ctx.graph.getStats();
    const header = `Knowledge Audit Report\n${"━".repeat(22)}\nSources: ${ctx.graph.sources.length}\nFragments scanned: ${stats.total}\nBroken refs: ${brokenRefs}\nBroken related: ${brokenRelated}` +
      (unscopedRefs > 0 ? `\nUnscoped refs (not validated): ${unscopedRefs}` : "");

    if (issues.length === 0) {
      return text(`${header}\n\n✅ All refs and related links are valid.`);
    }
    return text(`${header}\n\nDetails:\n${issues.join("\n\n")}`);
  });

  // ── list_sources ───────────────────────────────────────────────
  server.tool("list_sources", "List all loaded knowledge sources with their aliases, paths, and fragment counts.", {}, async () => {
    const ctx = await dctx.waitForInit();
    const sources = ctx.graph.sources;

    // Diagnostic: MCP roots
    let rootsInfo = "MCP roots: (not queried)";
    try {
      const rootsResult = await server.server.listRoots();
      const roots = rootsResult?.roots;
      rootsInfo = roots && roots.length > 0
        ? `MCP roots: ${roots.map(r => r.uri).join(", ")}`
        : "MCP roots: [] (empty)";
    } catch (e) {
      rootsInfo = `MCP roots: error (${(e as Error).message})`;
    }

    // Diagnostic: all environment variables
    const envLines = Object.entries(process.env)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `  ${k}=${v}`);
    const envInfo = `Env (${envLines.length} vars):\n${envLines.join("\n")}`;

    const header = [
      `startDir: ${ctx.outputRoot}`,
      `process.cwd(): ${process.cwd()}`,
      rootsInfo,
      envInfo,
    ].join("\n");

    if (sources.length === 0) {
      return text(`${header}\n\nNo knowledge sources loaded.`);
    }
    const lines = sources.map(s => {
      const count = [...ctx.graph.sourceMap.values()].filter(v => v.sourceId === s.sourceId).length;
      return `- **${s.alias}**: ${s.knowledgeDir} (${count} fragments, refScope: ${s.refScope})`;
    });
    return text(`${header}\n\nLoaded ${sources.length} source(s):\n\n${lines.join("\n")}`);
  });
};

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}
