import { z } from "zod";

import type { MutationResult } from "../../types.js";
import type { ToolRegistrar } from "./context.js";

export const registerManageTools: ToolRegistrar = (server, dctx) => {
  // ── add_knowledge ──────────────────────────────────────────────
  server.tool(
    "add_knowledge",
    "Create a new knowledge fragment file with proper frontmatter.",
    {
      path: z
        .string()
        .describe("Fragment path, e.g. 'workflow/git' or 'personal@workflow/git'. Extension optional."),
      title: z.string().describe("Fragment title"),
      content: z.string().describe("Fragment content (markdown)"),
      tags: z.array(z.string()).describe("Tags for this fragment"),
      related: z.array(z.string()).optional().default([]).describe("Related fragment paths (same source only)"),
      refs: z.array(z.string()).optional().default([]).describe("Source code references"),
      source: z.string().optional().describe("Source of this knowledge (for frontmatter)"),
    },
    async ({ path, title, content, tags, related, refs, source }) => {
      const ctx = await dctx.waitForInit();
      const result = ctx.store.add({ path, title, content, tags, related, refs, source });
      return text(formatMutation(result, "Created"));
    }
  );

  // ── update_knowledge ───────────────────────────────────────────
  server.tool(
    "update_knowledge",
    "Update an existing knowledge fragment's content, tags, or related links.",
    {
      path: z.string().describe("Fragment path (e.g. 'workflow/git.md' or 'personal@workflow/git.md')"),
      title: z.string().optional().describe("New title (replaces H1 in content)"),
      content: z.string().optional().describe("New content (replaces existing)"),
      tags: z.array(z.string()).optional().describe("New tags (replaces existing)"),
      related: z.array(z.string()).optional().describe("New related links (same source only, replaces existing)"),
      refs: z.array(z.string()).optional().describe("New source code refs (replaces existing)"),
    },
    async ({ path, title, content, tags, related, refs }) => {
      const ctx = await dctx.waitForInit();
      const result = ctx.store.update(path, { title, content, tags, related, refs });
      return text(formatMutation(result, "Updated"));
    }
  );
  // ── delete_knowledge ─────────────────────────────────────────
  server.tool(
    "delete_knowledge",
    "Delete a knowledge fragment permanently.",
    {
      path: z.string().describe("Fragment path (e.g. 'workflow/git' or 'personal@workflow/git')"),
    },
    async ({ path }) => {
      const ctx = await dctx.waitForInit();
      const result = ctx.store.delete(path);
      return text(formatMutation(result, "Deleted"));
    }
  );
};

function formatMutation(result: MutationResult, verb: string): string {
  if (!result.success) return `Error: ${result.error}`;
  const msg = `${verb} fragment: ${result.path}`;
  return result.warnings && result.warnings.length > 0 ? `${msg}\n\n${result.warnings.join("\n")}` : msg;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}
