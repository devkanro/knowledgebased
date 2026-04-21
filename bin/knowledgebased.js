#!/usr/bin/env node

// CLI commands run regardless of whether knowledge is discovered.
const { runCli } = await import("../dist/cli/index.js");
const handled = await runCli(process.argv[2], process.argv.slice(3));
if (handled) process.exit(0);

// Otherwise: discover all knowledge sources for the current cwd.
const { discoverSources } = await import("../dist/discovery.js");
const sources = discoverSources(process.cwd());

if (sources.length === 0) {
  process.exit(0);
}

// Normal MCP server mode — import heavy deps only now.
const { startServer } = await import("../dist/mcp/server.js");
await startServer(sources);
