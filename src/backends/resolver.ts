import type { HandoffBackend } from "./backend.js";
import { FsBackend } from "./fs-backend.js";
import type { AgentctxConfig } from "../utils/config.js";

export type ResolveResult = {
  backend: HandoffBackend;
  fallbackFrom?: string;
  fallbackReason?: string;
};

export async function resolveBackend(
  cwd: string,
  config: AgentctxConfig,
  explicit?: string,
): Promise<ResolveResult> {
  if (explicit === "fs") {
    return { backend: new FsBackend(cwd) };
  }

  if (explicit === "github" || explicit === "obsidian") {
    throw new Error(
      `${explicit} backend is not yet implemented. Use --backend fs.`,
    );
  }

  if (config.defaultBackend && config.defaultBackend !== "fs") {
    const reason = `${config.defaultBackend} is not yet implemented`;
    console.error(`[agentctx] ${reason}, falling back to fs`);
    return {
      backend: new FsBackend(cwd),
      fallbackFrom: config.defaultBackend,
      fallbackReason: reason,
    };
  }

  return { backend: new FsBackend(cwd) };
}
