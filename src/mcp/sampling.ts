import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FragmentResult } from "../types.js";

/**
 * Check whether the connected MCP client advertises sampling support.
 *
 * We inspect `_clientCapabilities` — a private field set after the
 * `initialize` handshake. If the field is missing or `sampling` is
 * falsy the client cannot handle `sampling/createMessage`.
 */
export function isSamplingAvailable(server: McpServer): boolean {
  // The low-level Server stores capabilities after the handshake.
  // There is no public getter yet, so we peek at the private field.
  const caps = (server.server as unknown as Record<string, unknown>)["_clientCapabilities"] as
    | { sampling?: unknown }
    | undefined;
  return !!caps?.sampling;
}

/**
 * Ask the client LLM to produce a query-aware summary of the given
 * fragments.  Returns the LLM-generated text, or `null` on failure.
 */
export async function summarizeFragments(
  server: McpServer,
  query: string,
  fragments: FragmentResult[],
  maxTokens: number,
): Promise<string | null> {
  if (fragments.length === 0) return null;

  const docs = fragments
    .map((f, i) => `--- Document ${i + 1}: ${f.path} (${f.title}) ---\n${f.content}`)
    .join("\n\n");

  const systemPrompt = [
    "You are a knowledge-base assistant.",
    "Given a user query and a set of knowledge documents, extract and synthesize ONLY the information relevant to the query.",
    "Be concise but thorough. Preserve technical accuracy.",
    "If a document is not relevant to the query, skip it entirely.",
    "Do NOT list documents — produce a unified, coherent summary.",
  ].join(" ");

  try {
    const result = await server.server.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Query: ${query}\n\nDocuments:\n\n${docs}\n\nPlease synthesize the relevant information from these documents that addresses the query.`,
          },
        },
      ],
      systemPrompt,
      maxTokens,
      modelPreferences: {
        hints: [{ name: "claude-haiku" }, { name: "gpt-4o-mini" }],
        speedPriority: 0.8,
        costPriority: 0.8,
        intelligencePriority: 0.3,
      },
    });

    if (result.content.type === "text") {
      return result.content.text;
    }
    return null;
  } catch {
    return null;
  }
}
