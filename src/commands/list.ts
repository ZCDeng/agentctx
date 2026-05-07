import { Command } from "commander";
import { listCommand } from "../core/handoff-service.js";

export function createListCommand(): Command {
  return new Command("list")
    .description("List all handoffs")
    .option("-b, --backend <name>", "Backend to use (fs|github|obsidian)")
    .option("--status <status>", "Filter by status")
    .option("--label <tags...>", "Filter by labels (space-separated)")
    .option("--format <format>", "Output format: table | json", "table")
    .option("--all", "Include done/abandoned handoffs")
    .action(async (options) => {
      const cwd = process.cwd();
      const output = await listCommand(cwd, {
        status: options.all ? undefined : (options.status || "in-progress"),
        labels: options.label,
        backend: options.backend,
        format: options.format,
      });
      console.log(output);
    });
}
