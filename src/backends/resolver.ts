import type { HandoffBackend } from "./backend.js";
import { FsBackend } from "./fs-backend.js";
import { GitHubBackend } from "./github-backend.js";
import { exec } from "../utils/exec.js";
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
  // Explicit backend: fail loud if unavailable
  if (explicit) {
    const backend = await createBackend(explicit, cwd, config);
    if (!backend) {
      throw new Error(
        `${explicit} backend is not available. Check installation or authentication.`,
      );
    }
    return { backend };
  }

  // Config default backend
  if (config.defaultBackend && config.defaultBackend !== "fs") {
    const backend = await createBackend(config.defaultBackend, cwd, config);
    if (backend) return { backend };

    const reason = `${config.defaultBackend} is not available`;
    console.error(`[agentctx] ${reason}, falling back to fs`);
    return {
      backend: new FsBackend(cwd),
      fallbackFrom: config.defaultBackend,
      fallbackReason: reason,
    };
  }

  // Default: fs always available
  return { backend: new FsBackend(cwd) };
}

async function createBackend(
  name: string,
  cwd: string,
  config: AgentctxConfig,
): Promise<HandoffBackend | null> {
  switch (name) {
    case "fs":
      return new FsBackend(cwd);

    case "github": {
      const repo = config.githubRepo || (await detectGitHubRepo(cwd));
      if (!repo) {
        if (config.defaultBackend === "github") {
          console.error(
            "[agentctx] No GitHub repo configured. Set githubRepo in config or use gh CLI.",
          );
        }
        return null;
      }
      const backend = new GitHubBackend(repo);
      const probe = await backend.probe();
      if (!probe.ok) {
        if (config.defaultBackend === "github") {
          console.error(`[agentctx] GitHub: ${probe.reason}`);
        }
        return null;
      }
      return backend;
    }

    case "obsidian": {
      // Obsidian not yet implemented, skip probe
      return null;
    }

    default:
      return null;
  }
}

async function detectGitHubRepo(cwd: string): Promise<string | null> {
  try {
    const result = await exec("gh", ["repo", "view", "--json", "nameWithOwner"], { cwd });
    if (result.code === 0) {
      const data = JSON.parse(result.stdout);
      return data.nameWithOwner || null;
    }
  } catch {
    // gh not available or not in a git repo
  }
  return null;
}
