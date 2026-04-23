#!/usr/bin/env node

// CLI commands run regardless of whether knowledge is discovered.
const { runCli } = await import("../dist/cli/index.js");
const handled = await runCli(process.argv[2], process.argv.slice(3));
if (handled) process.exit(0);

// Parse --cwd override (highest priority for workspace resolution).
const cwdIdx = process.argv.indexOf("--cwd");
const cwdOverride = cwdIdx !== -1 && process.argv[cwdIdx + 1]
  ? process.argv[cwdIdx + 1]
  : undefined;

// MCP server mode — discovery is deferred until after connection
// so that MCP roots can provide the correct workspace directory.
const { startServer } = await import("../dist/mcp/server.js");
await startServer(cwdOverride);
