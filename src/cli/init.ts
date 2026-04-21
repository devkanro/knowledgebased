import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Initialize a knowledge directory in the current project.
 * Usage: knowledge-mcp init [--knowledge <path>]
 */
export async function init(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const defaultPath = join(cwd, "knowledge");
  let knowledgePath = defaultPath;

  const kIdx = args.indexOf("--knowledge");
  if (kIdx !== -1 && args[kIdx + 1]) {
    knowledgePath = args[kIdx + 1];
  }

  // External knowledge — write a pointer config instead of creating the dir.
  if (knowledgePath !== defaultPath) {
    const configPath = join(cwd, ".knowledge.json");
    writeFileSync(configPath, JSON.stringify({ knowledge: knowledgePath }, null, 2) + "\n", "utf-8");
    console.log(`✅ Created ${configPath}`);
    console.log(`   Knowledge dir: ${knowledgePath}`);
    return;
  }

  // Co-located mode.
  if (!existsSync(knowledgePath)) {
    mkdirSync(knowledgePath, { recursive: true });
    console.log(`✅ Created ${knowledgePath}`);
  } else {
    console.log(`knowledge/ directory already exists at ${knowledgePath}`);
  }
}
