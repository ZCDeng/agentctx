import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join as pjoin } from "node:path";
import type { Handoff, HandoffSummary, HandoffStatus } from "../core/schema.js";
import { HandoffSchema } from "../core/schema.js";
import { serialize, parse, parseSafe } from "../core/formatter.js";
import { toSummary } from "../core/schema.js";
import { uuid, id8 } from "../utils/uuid.js";
import type { HandoffBackend } from "./backend.js";

const HANDOFFS_DIR = ".agentctx/handoffs";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function filename(project: string, title: string, shortId: string): string {
  return `${project}-${slugify(title)}.${shortId}.handoff.md`;
}

function globDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".handoff.md"))
    .map((f) => pjoin(dir, f));
}

export class FsBackend implements HandoffBackend {
  readonly name = "fs" as const;
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  private get dir(): string {
    return pjoin(this.cwd, HANDOFFS_DIR);
  }

  async probe(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: true };
  }

  async save(handoff: Handoff): Promise<{ id: string; ref: string }> {
    ensureDir(this.dir);
    const shortId = id8(handoff.id);
    const project = handoff.project || "unknown";
    const fname = filename(project, handoff.title, shortId);
    const filepath = pjoin(this.dir, fname);
    const content = serialize(handoff);
    writeFileSync(filepath, content, "utf-8");
    return { id: handoff.id, ref: filepath };
  }

  async load(idOrLast: string): Promise<Handoff> {
    if (idOrLast === "--last") {
      const handoffs = await this.loadAll();
      handoffs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (handoffs.length === 0) {
        throw new Error("No handoffs found");
      }
      return handoffs[0];
    }

    const files = globDir(this.dir);
    for (const file of files) {
      if (file.includes(idOrLast)) {
        return parse(readFileSync(file, "utf-8"));
      }
    }
    throw new Error(`Handoff not found: ${idOrLast}`);
  }

  async list(filter?: {
    project?: string;
    status?: HandoffStatus;
    labels?: string[];
    limit?: number;
  }): Promise<HandoffSummary[]> {
    let handoffs = await this.loadAll();
    if (filter?.status) {
      handoffs = handoffs.filter((h) => h.status === filter.status);
    }
    if (filter?.project) {
      handoffs = handoffs.filter((h) => h.project === filter.project);
    }
    if (filter?.labels && filter.labels.length > 0) {
      handoffs = handoffs.filter((h) =>
        filter.labels!.some((l) => h.labels.includes(l)),
      );
    }
    handoffs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (filter?.limit) {
      handoffs = handoffs.slice(0, filter.limit);
    }
    return handoffs.map(toSummary);
  }

  async update(
    id: string,
    patch: Partial<Handoff>,
  ): Promise<Handoff> {
    const handoff = await this.load(id);
    const updated = { ...handoff, ...patch, updated_at: new Date().toISOString() };
    await this.save(updated);
    return updated;
  }

  private async loadAll(): Promise<Handoff[]> {
    const files = globDir(this.dir);
    const handoffs: Handoff[] = [];
    for (const file of files) {
      const parsed = parseSafe(readFileSync(file, "utf-8"));
      if (parsed) handoffs.push(parsed);
    }
    return handoffs;
  }
}
