import { Command } from "commander";
import { load } from "../core/handoff-service.js";

export function createLoadCommand(): Command {
  return new Command("load")
    .description("Load a handoff to continue work")
    .option("-i, --id <id>", "Handoff ID or unique prefix")
    .option("--last", "Load most recently updated handoff")
    .option("-b, --backend <name>", "Backend to use (fs|github|obsidian)")
    .option("--chain", "Load the full handoff chain")
    .option("--no-chain", "Load single handoff only (default)")
    .option(
      "--format <format>",
      "Output format: markdown | json | context-prompt",
      "markdown",
    )
    .action(async (options) => {
      const cwd = process.cwd();
      if (!options.id && !options.last) {
        console.error("Specify --id <uuid> or --last");
        process.exit(1);
      }
      const idOrLast = options.id || "--last";
      const output = await load(cwd, {
        idOrLast,
        backend: options.backend,
        chain: options.chain,
        format: options.format,
      });
      console.log(output);
    });
}
