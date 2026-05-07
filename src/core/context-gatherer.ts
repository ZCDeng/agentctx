import { basename, join as pjoin } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { execOk } from "../utils/exec.js";

export type GitContext = {
  branch?: string;
  commit?: string;
  filesModified: string[];
};

export async function gatherGitContext(cwd: string): Promise<GitContext> {
  try {
    const [rawBranch, commit, status] = await Promise.all([
      execOk("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }).catch(() => ""),
      execOk("git", ["rev-parse", "--short", "HEAD"], { cwd }).catch(() => ""),
      execOk("git", ["status", "--porcelain"], { cwd }).catch(() => ""),
    ]);

    const branch = rawBranch === "HEAD" ? undefined : rawBranch || undefined;

    const filesModified = status
      ? status
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            // porcelain format: XY filename or XY oldname -> newname
            const content = line.slice(3).trim();
            const arrowIdx = content.indexOf(" -> ");
            return arrowIdx > 0 ? content.slice(arrowIdx + 4).trim() : content;
          })
          .filter(Boolean)
      : [];

    return {
      branch,
      commit: commit || undefined,
      filesModified,
    };
  } catch {
    return { filesModified: [] };
  }
}

export async function detectAgent(): Promise<string> {
  // Active session env vars take priority
  if (process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_VERSION) {
    return "claude-code";
  }
  if (process.env.CURSOR_SESSION_ID) return "cursor";
  if (process.env.WINDSURF_SESSION_ID) return "windsurf";
  if (process.env.GEMINI_SESSION_ID) return "gemini-cli";

  // Fall back to directory-based detection
  if (existsSync(`${homedir()}/.codex`)) {
    const sessionId = await detectCodexSessionId();
    if (sessionId) return "codex";
  }

  return process.env.AGENTCTX_AGENT || "unknown";
}

export async function detectSessionId(): Promise<string | undefined> {
  return (
    process.env.CLAUDE_SESSION_ID ||
    process.env.CLAUDE_CONVERSATION_ID ||
    process.env.CURSOR_SESSION_ID ||
    process.env.WINDSURF_SESSION_ID ||
    process.env.GEMINI_SESSION_ID ||
    (await detectCodexSessionId()) ||
    process.env.AGENTCTX_SESSION_ID ||
    undefined
  );
}

async function detectCodexSessionId(): Promise<string | undefined> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(`${homedir()}/.codex/state_5.sqlite`, {
      open: true,
      readOnly: true,
    });
    try {
      const row = db
        .prepare(
          "SELECT id FROM threads ORDER BY updated_at_ms DESC LIMIT 1",
        )
        .get() as { id?: string } | undefined;
      return row?.id;
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

export function detectProject(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(pjoin(cwd, "package.json"), "utf-8")) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    // no package.json
  }
  return basename(cwd);
}
