import { Command } from "commander";
import { statusCommand } from "../core/handoff-service.js";
import type { HandoffStatus } from "../core/schema.js";

const VALID_STATUSES: HandoffStatus[] = [
  "pending",
  "in-progress",
  "blocked",
  "done",
  "abandoned",
];

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Update handoff status")
    .requiredOption("-i, --id <id>", "Handoff ID or --last")
    .requiredOption("--set <status>", `New status: ${VALID_STATUSES.join("|")}`)
    .option("-b, --backend <name>", "Backend to use (fs|github|obsidian)")
    .action(async (options) => {
      if (!VALID_STATUSES.includes(options.set as HandoffStatus)) {
        console.error(
          `Invalid status: ${options.set}. Must be one of: ${VALID_STATUSES.join(", ")}`,
        );
        process.exit(1);
      }
      const cwd = process.cwd();
      const output = await statusCommand(cwd, {
        idOrLast: options.id,
        status: options.set as HandoffStatus,
        backend: options.backend,
      });
      console.log(output);
    });
}
