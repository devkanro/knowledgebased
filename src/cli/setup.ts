import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

import { MCP_CONFIG_PATH, SERVER_NAME } from "../constants.js";

const GLOBAL_SERVER_ENTRY = {
  type: "stdio",
  command: "npx",
  args: ["-y", SERVER_NAME],
  tools: ["*"],
};

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Register knowledge-mcp globally in ~/.copilot/mcp-config.json. */
export async function setup(): Promise<void> {
  const dir = dirname(MCP_CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let config: McpConfig = {};
  if (existsSync(MCP_CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8")) as McpConfig;
    } catch {
      config = {};
    }
  }

  if (!config.mcpServers) config.mcpServers = {};

  if (config.mcpServers.knowledge) {
    console.log(`${SERVER_NAME} is already registered globally.`);
    console.log(`  Config: ${MCP_CONFIG_PATH}`);
    return;
  }

  config.mcpServers.knowledge = GLOBAL_SERVER_ENTRY;

  writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`✅ ${SERVER_NAME} registered globally.`);
  console.log(`   Config: ${MCP_CONFIG_PATH}`);
  console.log("");
  console.log("The server will auto-activate in any project that has a knowledge/ dir");
  console.log("or .knowledge.json config. Otherwise it stays disabled (zero overhead).");
}
