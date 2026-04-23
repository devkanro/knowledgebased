import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { DeferredToolContext } from "./context.js";
import { registerInspectTools } from "./inspect.js";
import { registerLifecycleTools } from "./lifecycle.js";
import { registerManageTools } from "./manage.js";
import { registerSearchTools } from "./search.js";

export type { ToolContext, DeferredToolContext } from "./context.js";

/** Register every MCP tool exposed by this server. */
export function registerAllTools(server: McpServer, ctx: DeferredToolContext): void {
  registerSearchTools(server, ctx);
  registerManageTools(server, ctx);
  registerInspectTools(server, ctx);
  registerLifecycleTools(server, ctx);
}
