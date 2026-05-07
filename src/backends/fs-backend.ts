import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join as pjoin } from "node:path";
import type { Handoff, HandoffSummary, HandoffStatus } from "../core/schema.js";
import { HandoffSchema } from "../core/schema.js";
import { serialize, parse, parseSafe } from "../core/formatter.js";
import { toSummary } from "../core/schema.js";
import { uuid, id8 } from "../utils/uuid.js";
import { slugify } from "../utils/string.js";
import { filterHandoffs, applyPatch } from "../utils/filter.js";
import type { HandoffBackend } from "./backend.js";

const HANDOFFS_DIR = ".agentctx/handoffs";

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function filename(project: string, title: string, shortId: string): string {
  return `${slugify(project)}-${slugify(title)}.${shortId}.handoff.md`;
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

    const all = await this.loadAll();
    const match = all.find((h) => h.id === idOrLast || h.id.startsWith(idOrLast));
    if (match) return match;
    throw new Error(`Handoff not found: ${idOrLast}`);
  }

  async list(filter?: {
    project?: string;
    status?: HandoffStatus;
    labels?: string[];
    limit?: number;
  }): Promise<HandoffSummary[]> {
    const handoffs = await this.loadAll();
    return filterHandoffs(handoffs, filter);
  }

  async update(
    id: string,
    patch: Partial<Handoff>,
  ): Promise<Handoff> {
    const handoff = await this.load(id);
    const updated = applyPatch(handoff, patch);
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
