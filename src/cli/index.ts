/**
 * CLI entrypoint dispatcher. Lazy-loads command modules so the
 * happy-path bootstrap (no command, no knowledge) stays fast.
 */
export async function runCli(command: string | undefined, args: string[]): Promise<boolean> {
  switch (command) {
    case "setup": {
      const { setup } = await import("./setup.js");
      await setup();
      return true;
    }
    case "init": {
      const { init } = await import("./init.js");
      await init(args);
      return true;
    }
    default:
      return false;
  }
}
