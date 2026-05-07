import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join as pjoin } from "node:path";

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize agentctx in the current project")
    .option("-b, --backend <name>", "Default backend for this project (fs|github|obsidian)", "fs")
    .action((options) => {
      const cwd = process.cwd();
      const agentctxDir = pjoin(cwd, ".agentctx");
      const handoffsDir = pjoin(agentctxDir, "handoffs");
      const configFile = pjoin(agentctxDir, "config.json");

      if (!existsSync(handoffsDir)) {
        mkdirSync(handoffsDir, { recursive: true });
      }

      if (existsSync(configFile)) {
        console.log(`Already initialized: ${configFile}`);
      } else {
        const config = {
          defaultBackend: options.backend,
        };
        writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf-8");
        console.log(`Initialized agentctx at ${agentctxDir}`);
        console.log(`  Backend: ${options.backend}`);
        console.log(`  Handoffs: ${handoffsDir}`);
      }
    });
}
