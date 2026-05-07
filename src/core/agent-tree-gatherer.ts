import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join as pjoin } from "node:path";
import { homedir } from "node:os";
import { execOk } from "../utils/exec.js";
import type { AgentTreeNode } from "./schema.js";

export async function discoverAgentTree(
  sessionId: string,
  agent: string,
  options: { maxDepth?: number } = {},
): Promise<AgentTreeNode[]> {
  const maxDepth = options.maxDepth ?? 2;
  if (maxDepth < 1) return [];

  if (agent === "codex") {
    return discoverCodexTree(sessionId, maxDepth);
  }
  if (agent === "claude-code") {
    return discoverClaudeTree(sessionId, maxDepth);
  }
  return [];
}

async function discoverCodexTree(
  sessionId: string,
  maxDepth: number,
): Promise<AgentTreeNode[]> {
  const nodes: AgentTreeNode[] = [];
  const dbPath = pjoin(homedir(), ".codex", "state_5.sqlite");
  if (!existsSync(dbPath)) return nodes;

  try {
    const edges = await queryCodexEdges(dbPath, sessionId, maxDepth);
    for (const edge of edges) {
      const summary = await queryCodexSummary(dbPath, edge.childId);
      const threadInfo = await queryCodexThread(dbPath, edge.childId);
      nodes.push({
        role: threadInfo?.role || threadInfo?.nickname || "subagent",
        agent: `codex/${threadInfo?.model || "unknown"}`,
        session_id: edge.childId,
        summary: summary || "No summary available",
        tokens: threadInfo?.tokens,
        findings: undefined,
      });
    }
  } catch {
    // SQLite access failed, skip
  }
  return nodes;
}

async function queryCodexEdges(
  dbPath: string,
  parentId: string,
  maxDepth: number,
): Promise<{ childId: string }[]> {
  try {
    const sql = `
      WITH RECURSIVE tree(child_id, depth) AS (
        SELECT child_thread_id, 1
        FROM thread_spawn_edges
        WHERE parent_thread_id = ?
        UNION ALL
        SELECT e.child_thread_id, t.depth + 1
        FROM thread_spawn_edges e
        JOIN tree t ON e.parent_thread_id = t.child_id
        WHERE t.depth < ?
      )
      SELECT child_id FROM tree ORDER BY depth
    `;
    const output = await execOk("sqlite3", ["-readonly", dbPath, sql, parentId, String(maxDepth)]);
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => ({ childId: line.trim() }));
  } catch {
    return [];
  }
}

async function queryCodexSummary(
  dbPath: string,
  threadId: string,
): Promise<string | null> {
  try {
    const output = await execOk("sqlite3", [
      "-readonly",
      dbPath,
      "SELECT rollout_summary FROM stage1_outputs WHERE thread_id = ?",
      threadId,
    ]);
    return output.trim() || null;
  } catch {
    return null;
  }
}

async function queryCodexThread(
  dbPath: string,
  threadId: string,
): Promise<{ role?: string; nickname?: string; model?: string; tokens?: number } | null> {
  try {
    const output = await execOk("sqlite3", [
      "-readonly", "-json",
      dbPath,
      "SELECT agent_role, agent_nickname, model, tokens_used FROM threads WHERE id = ?",
      threadId,
    ]);
    const rows = JSON.parse(output);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return {
      role: row.agent_role || undefined,
      nickname: row.agent_nickname || undefined,
      model: row.model || undefined,
      tokens: row.tokens_used != null ? Number(row.tokens_used) : undefined,
    };
  } catch {
    return null;
  }
}

async function discoverClaudeTree(
  _sessionId: string,
  _maxDepth: number,
): Promise<AgentTreeNode[]> {
  const nodes: AgentTreeNode[] = [];
  try {
    const transcriptPath = findClaudeTranscript(_sessionId);
    if (!transcriptPath) return nodes;

    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type !== "task" && event.type !== "agent") continue;
        const payload = event.payload || event;
        nodes.push({
          role: payload.role || payload.agent_type || "subagent",
          agent: `claude-code/${payload.model || payload.agent || "unknown"}`,
          session_id: payload.session_id || payload.id,
          summary: payload.description || payload.summary || "No summary available",
          findings: payload.findings || payload.result,
        });
      } catch {
        // skip unparseable lines
      }
    }
  } catch {
    // transcript access failed, skip
  }
  return nodes;
}

function findClaudeTranscript(sessionId: string): string | null {
  const projectsDir = pjoin(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return null;

  try {
    const dirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    for (const dir of dirs) {
      const candidate = pjoin(projectsDir, dir.name, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // scan failed
  }
  return null;
}
