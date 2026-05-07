import { Command } from "commander";
import { save } from "../core/handoff-service.js";

export function createSaveCommand(): Command {
  return new Command("save")
    .description("Save current task context as a handoff")
    .option("-m, --message <text>", "Description of current state")
    .option("-t, --title <title>", "Title for the handoff")
    .option("-b, --backend <name>", "Backend to use (fs|github|obsidian)")
    .option("--label <tags...>", "Add labels (space-separated)")
    .option("--tree", "Discover and include sub-agent tree")
    .option("--no-tree", "Skip agent tree discovery (default)")
    .option("--max-depth <n>", "Max agent tree depth (default: 2)", "2")
    .action(async (options) => {
      const cwd = process.cwd();
      const md = parseInt(options.maxDepth, 10);
      const result = await save(cwd, {
        message: options.message || "No message provided",
        title: options.title,
        labels: options.label,
        backend: options.backend,
        tree: options.tree,
        maxTreeDepth: Number.isNaN(md) ? undefined : md,
      });
      console.log(`Saved handoff ${result.id.slice(0, 8)} → ${result.ref}`);
    });
}
