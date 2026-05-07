#!/usr/bin/env node

import { Command } from "commander";
import { createSaveCommand } from "./commands/save.js";
import { createLoadCommand } from "./commands/load.js";
import { createListCommand } from "./commands/list.js";
import { createStatusCommand } from "./commands/status.js";
import { createConfigCommand } from "./commands/config.js";
import { createInitCommand } from "./commands/init.js";

const program = new Command();

program
  .name("agentctx")
  .description("Cross-AI-client task handoff CLI")
  .version("0.1.0")
  .addCommand(createSaveCommand())
  .addCommand(createLoadCommand())
  .addCommand(createListCommand())
  .addCommand(createStatusCommand())
  .addCommand(createConfigCommand())
  .addCommand(createInitCommand());

program.parseAsync().catch((err) => {
  console.error(`[agentctx] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
