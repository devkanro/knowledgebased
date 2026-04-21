import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ToolContext } from "./context.js";
import { registerInspectTools } from "./inspect.js";
import { registerManageTools } from "./manage.js";
import { registerSearchTools } from "./search.js";

export type { ToolContext } from "./context.js";

/** Register every MCP tool exposed by this server. */
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerSearchTools(server, ctx);
  registerManageTools(server, ctx);
  registerInspectTools(server, ctx);
}
