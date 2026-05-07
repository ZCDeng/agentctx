import { Command } from "commander";
import { loadConfig, saveUserConfig, saveProjectConfig } from "../utils/config.js";

export function createConfigCommand(): Command {
  const cmd = new Command("config")
    .description("Manage agentctx configuration");

  cmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const cwd = process.cwd();
      const config = loadConfig(cwd);
      console.log(JSON.stringify(config, null, 2));
    });

  cmd
    .command("set <key> <value>")
    .description("Set a configuration value")
    .option("--global", "Set in user config (~/.agentctx/config.json)")
    .action((key: string, value: string, options: { global?: boolean }) => {
      const cwd = process.cwd();
      const partial: Record<string, string> = { [key]: value };
      if (options.global) {
        saveUserConfig(partial);
        console.log(`Set ${key}=${value} in user config`);
      } else {
        saveProjectConfig(cwd, partial);
        console.log(`Set ${key}=${value} in project config`);
      }
    });

  return cmd;
}
