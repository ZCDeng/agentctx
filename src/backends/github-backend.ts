import { writeFileSync, unlinkSync } from "node:fs";
import { join as pjoin } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execOk, exec } from "../utils/exec.js";
import { serialize, parse, parseSafe } from "../core/formatter.js";
import { toSummary, type Handoff, type HandoffSummary, type HandoffStatus } from "../core/schema.js";
import type { HandoffBackend } from "./backend.js";

const BASE_LABELS = ["agentctx"];
const STATUS_LABEL_PREFIX = "agentctx:status:";
const PROJECT_LABEL_PREFIX = "project:";

function statusLabel(status: HandoffStatus): string {
  return `${STATUS_LABEL_PREFIX}${status}`;
}

function statusFromLabels(labels: string[]): HandoffStatus {
  for (const label of labels) {
    if (label.startsWith(STATUS_LABEL_PREFIX)) {
      const s = label.slice(STATUS_LABEL_PREFIX.length);
      if (isValidStatus(s)) return s as HandoffStatus;
    }
  }
  return "in-progress";
}

function isValidStatus(s: string): boolean {
  return ["pending", "in-progress", "blocked", "done", "abandoned"].includes(s);
}

function projectLabel(project: string): string {
  return `${PROJECT_LABEL_PREFIX}${project}`;
}

export class GitHubBackend implements HandoffBackend {
  readonly name = "github" as const;
  private repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  async probe(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const result = await exec("gh", ["auth", "status"], {
        env: { GH_REPO: this.repo },
      });
      if (result.code !== 0) {
        return { ok: false, reason: "gh auth status failed — run gh auth login" };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "gh CLI not found — install GitHub CLI (gh)" };
    }
  }

  async save(handoff: Handoff): Promise<{ id: string; ref: string }> {
    const tmpFile = pjoin(tmpdir(), `agentctx-${randomUUID()}.md`);
    const content = serialize(handoff);
    writeFileSync(tmpFile, content, "utf-8");

    const labels = [
      ...BASE_LABELS,
      statusLabel(handoff.status),
      ...(handoff.project ? [projectLabel(handoff.project)] : []),
      ...(handoff.labels || []).filter((l) => !l.startsWith("agentctx:") && !l.startsWith("project:")),
    ];

    try {
      const args = [
        "issue", "create",
        "--title", handoff.title,
        "--body-file", tmpFile,
        ...labels.flatMap((l) => ["--label", l]),
      ];
      const url = await execOk("gh", args, { env: { GH_REPO: this.repo } });
      const numberMatch = url.trim().match(/\/(\d+)$/);
      const ref = url.trim();
      const id = handoff.id;
      return { id, ref };
    } finally {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  async load(idOrLast: string): Promise<Handoff> {
    if (idOrLast === "--last") {
      const issues = await this.listIssues({ limit: 1 });
      if (issues.length === 0) throw new Error("No handoffs found");
      return this.loadByNumber(issues[0].number);
    }

    // Try as issue number first (only if purely numeric), then search body for uuid
    if (/^\d+$/.test(idOrLast)) {
      return this.loadByNumber(parseInt(idOrLast, 10));
    }

    // Search by UUID substring in body
    const result = await exec("gh", [
      "search", "issues",
      idOrLast,
      "--match", "body",
      "--repo", this.repo,
      "--label", "agentctx",
      "--limit", "1",
      "--json", "number",
    ]);
    const body = result.stdout.trim();
    if (!body || result.code !== 0) {
      throw new Error(`Handoff not found: ${idOrLast}`);
    }
    const parsed = JSON.parse(body);
    if (!parsed || parsed.length === 0) {
      throw new Error(`Handoff not found: ${idOrLast}`);
    }
    return this.loadByNumber(parsed[0].number);
  }

  private async loadByNumber(num: number): Promise<Handoff> {
    try {
      const raw = await execOk("gh", [
        "issue", "view", String(num),
        "--json", "body,title,labels,updatedAt",
      ]);
      const issue = JSON.parse(raw);
      const parsed = parseSafe(issue.body || "");
      if (!parsed) {
        throw new Error(`Handoff not found: issue #${num} has invalid or empty body`);
      }
      return {
        ...parsed,
        updated_at: issue.updatedAt,
      };
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Handoff not found: issue #${num} — failed to parse GitHub response`);
      }
      throw err;
    }
  }

  async list(filter?: {
    project?: string;
    status?: HandoffStatus;
    labels?: string[];
    limit?: number;
  }): Promise<HandoffSummary[]> {
    const issues = await this.listIssues({ limit: filter?.limit ?? 50 });
    const handoffs: HandoffSummary[] = [];

    for (const issue of issues) {
      const parsed = parseSafe(issue.body ?? "");
      if (!parsed) continue;

      if (filter?.status && parsed.status !== filter.status) continue;
      if (filter?.project && parsed.project !== filter.project) continue;
      if (filter?.labels && filter.labels.length > 0) {
        if (!filter.labels.some((l) => parsed.labels.includes(l))) continue;
      }

      handoffs.push(toSummary(parsed));
    }

    handoffs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return handoffs;
  }

  async update(
    id: string,
    patch: Partial<Handoff>,
  ): Promise<Handoff> {
    if (!/^\d+$/.test(id)) {
      // Search for the issue number by UUID in body
      const result = await exec("gh", [
        "search", "issues",
        id,
        "--match", "body",
        "--repo", this.repo,
        "--label", "agentctx",
        "--limit", "1",
        "--json", "number",
      ]);
      const body = result.stdout.trim();
      if (!body || result.code !== 0) {
        throw new Error(`Handoff not found: ${id}`);
      }
      const parsed = JSON.parse(body);
      if (!parsed || parsed.length === 0) {
        throw new Error(`Handoff not found: ${id}`);
      }
      const handoff = await this.load(String(parsed[0].number));
      return this.updateByNumber(parsed[0].number, handoff, patch);
    }

    const num = parseInt(id, 10);
    const handoff = await this.loadByNumber(num);
    return this.updateByNumber(num, handoff, patch);
  }

  private async updateByNumber(
    num: number,
    handoff: Handoff,
    patch: Partial<Handoff>,
  ): Promise<Handoff> {
    const updated = { ...handoff, ...patch, updated_at: new Date().toISOString() };

    // Handle status change → swap labels
    const addLabels: string[] = [];
    const removeLabels: string[] = [];

    if (patch.status && patch.status !== handoff.status) {
      removeLabels.push(statusLabel(handoff.status));
      addLabels.push(statusLabel(patch.status));
    }

    // Write new body to temp file
    const tmpFile = pjoin(tmpdir(), `agentctx-${randomUUID()}.md`);
    const content = serialize(updated);
    writeFileSync(tmpFile, content, "utf-8");

    try {
      const args = [
        "issue", "edit", String(num),
        "--body-file", tmpFile,
      ];
      for (const l of addLabels) args.push("--add-label", l);
      for (const l of removeLabels) args.push("--remove-label", l);

      await execOk("gh", args, { env: { GH_REPO: this.repo } });
    } finally {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }

    return updated;
  }

  private async listIssues(opts: {
    limit?: number;
  }): Promise<Array<{ number: number; body?: string }>> {
    try {
      const limit = opts.limit ?? 50;
      const raw = await execOk("gh", [
        "issue", "list",
        "--label", "agentctx",
        "--limit", String(limit),
        "--json", "number,body",
      ]);
      return JSON.parse(raw) as Array<{ number: number; body?: string }>;
    } catch (err) {
      throw new Error(`Failed to list handoffs from GitHub: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
}
