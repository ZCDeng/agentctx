import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join as pjoin, basename } from "node:path";
import { homedir } from "node:os";
import { exec, execOk } from "../utils/exec.js";
import { serialize, parseSafe } from "../core/formatter.js";
import { toSummary, type Handoff, type HandoffSummary, type HandoffStatus } from "../core/schema.js";
import { filterHandoffs, applyPatch } from "../utils/filter.js";
import { slugify } from "../utils/string.js";
import type { HandoffBackend } from "./backend.js";
import { id8 } from "../utils/uuid.js";
import type { AgentctxConfig } from "../utils/config.js";

const HANDOFFS_SUBDIR = "agentctx";

export type ObsidianTier = "rest" | "cli" | "fs";

export class ObsidianBackend implements HandoffBackend {
  readonly name = "obsidian" as const;
  private vaultPath: string;
  private activeTier: ObsidianTier = "fs";

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async probe(): Promise<{ ok: boolean; reason?: string; tier?: ObsidianTier }> {
    // Tier 1: REST API
    try {
      const result = await exec("curl", [
        "-sk", "--connect-timeout", "2",
        "https://127.0.0.1:27124/",
      ]);
      if (result.code === 0) {
        this.activeTier = "rest";
        return { ok: true, tier: "rest" };
      }
    } catch {
      // REST not available
    }

    // Tier 2: obsidian CLI
    const cliPath = await findObsidianCli();
    if (cliPath) {
      this.activeTier = "cli";
      return { ok: true, tier: "cli" };
    }

    // Tier 3: direct filesystem
    if (existsSync(this.vaultPath)) {
      this.activeTier = "fs";
      return { ok: true, tier: "fs" };
    }

    return { ok: false, reason: "Obsidian vault not found and REST API not running" };
  }

async save(handoff: Handoff): Promise<{ id: string; ref: string }> {
    await this.probe(); // refresh active tier
    const content = serialize(handoff);
    const shortId = id8(handoff.id);
    const project = slugify(handoff.project || "unknown");
    const filename = `${project}-${slugify(handoff.title)}.${shortId}.md`;
    const vaultRelativePath = `${HANDOFFS_SUBDIR}/${filename}`;

    switch (this.activeTier) {
      case "rest":
        await this.saveViaRest(vaultRelativePath, content);
        break;
      case "cli":
        await this.saveViaCli(vaultRelativePath, content);
        break;
      case "fs":
      default:
        await this.saveViaFs(vaultRelativePath, content);
        break;
    }

    const ref = `obsidian://${basename(this.vaultPath)}/${HANDOFFS_SUBDIR}/${filename}`;
    return { id: handoff.id, ref };
  }

  private async saveViaRest(path: string, content: string): Promise<void> {
    const result = await exec("curl", [
      "-sk", "-X", "PUT",
      `https://127.0.0.1:27124/vault/${path}`,
      "-H", "Content-Type: text/markdown",
      "-d", content,
      "--max-time", "10",
    ]);
    if (result.code !== 0) {
      throw new Error(
        `Obsidian REST API save failed: ${result.stderr || result.stdout.slice(0, 200)}`,
      );
    }
  }

  private async saveViaCli(path: string, content: string): Promise<void> {
    const fullPath = pjoin(this.vaultPath, path);
    const dir = pjoin(fullPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");

    // If Obsidian app is running, try to open the note
    try {
      await execOk("open", [`obsidian://open?vault=${encodeURIComponent(basename(this.vaultPath))}&file=${encodeURIComponent(path)}`]);
    } catch {
      // opening in app is best-effort
    }
  }

  private async saveViaFs(path: string, content: string): Promise<void> {
    const fullPath = pjoin(this.vaultPath, path);
    const dir = pjoin(fullPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  async load(idOrLast: string): Promise<Handoff> {
    await this.probe();
    const handoffsDir = pjoin(this.vaultPath, HANDOFFS_SUBDIR);

    if (this.activeTier === "rest") {
      return this.loadViaRest(idOrLast);
    }

    // CLI and fs both read from filesystem
    const files = listHandoffFiles(handoffsDir);

    if (idOrLast === "--last") {
      const all = files.map((f) => parseSafe(readFileSync(f, "utf-8"))).filter(Boolean) as Handoff[];
      all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (all.length === 0) throw new Error("No handoffs found");
      return all[0];
    }

    const all = files.map((f) => parseSafe(readFileSync(f, "utf-8"))).filter(Boolean) as Handoff[];
    const match = all.find((h) => h.id === idOrLast || h.id.startsWith(idOrLast));
    if (match) return match;
    throw new Error(`Handoff not found: ${idOrLast}`);
  }

  private async loadViaRest(idOrLast: string): Promise<Handoff> {
    if (idOrLast === "--last") {
      // List all notes via REST, then load the most recent
      const result = await execOk("curl", [
        "-sk", `https://127.0.0.1:27124/vault/${HANDOFFS_SUBDIR}/`,
      ]);
      const files = JSON.parse(result) as Array<{ name: string }>;
      if (files.length === 0) throw new Error("No handoffs found");

      const loaded = await Promise.all(
        files.map(async (f) => {
          const r = await execOk("curl", [
            "-sk", `https://127.0.0.1:27124/vault/${HANDOFFS_SUBDIR}/${f.name}`,
          ]);
          return parseSafe(r);
        }),
      );
      const handoffs = loaded.filter(Boolean) as Handoff[];
      handoffs.sort((a: Handoff, b: Handoff) => b.updated_at.localeCompare(a.updated_at));
      return handoffs[0];
    }

    // Search by UUID in filename or load by exact name
    throw new Error("REST load by UUID not yet implemented — use --last or fs backend");
  }

  async list(filter?: {
    project?: string;
    status?: HandoffStatus;
    labels?: string[];
    limit?: number;
  }): Promise<HandoffSummary[]> {
    await this.probe();
    const handoffsDir = pjoin(this.vaultPath, HANDOFFS_SUBDIR);
    const files = listHandoffFiles(handoffsDir);

    const handoffs = files
      .map((f) => parseSafe(readFileSync(f, "utf-8")))
      .filter(Boolean) as Handoff[];

    return filterHandoffs(handoffs, filter);
  }

  async update(
    id: string,
    patch: Partial<Handoff>,
  ): Promise<Handoff> {
    const handoff = await this.load(id);
    const updated = applyPatch(handoff, patch);

    // Re-save to the same location
    const shortId = id8(updated.id);
    const project = slugify(updated.project || "unknown");
    const filename = `${project}-${slugify(updated.title)}.${shortId}.md`;
    const vaultRelativePath = `${HANDOFFS_SUBDIR}/${filename}`;

    const content = serialize(updated);
    await this.probe();

    switch (this.activeTier) {
      case "rest":
        await this.saveViaRest(vaultRelativePath, content);
        break;
      case "cli":
        await this.saveViaCli(vaultRelativePath, content);
        break;
      default:
        await this.saveViaFs(vaultRelativePath, content);
        break;
    }

    return updated;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

async function findObsidianCli(): Promise<string | null> {
  const candidates = [
    "/Applications/Obsidian.app/Contents/MacOS/obsidian",
    `${homedir()}/.local/bin/obsidian`,
    "/usr/local/bin/obsidian",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const result = await exec(candidate, ["version"]);
      if (result.code === 0) return candidate;
    }
  }

  // Try PATH
  try {
    const result = await exec("obsidian", ["version"]);
    if (result.code === 0) return "obsidian";
  } catch {
    // not on PATH
  }

  return null;
}

export function detectVaultPath(config: AgentctxConfig): string | null {
  if (config.obsidianVault && existsSync(config.obsidianVault)) {
    return config.obsidianVault;
  }

  // Check Obsidian config
  try {
    const obsidianConfig = JSON.parse(
      readFileSync(
        `${homedir()}/Library/Application Support/obsidian/obsidian.json`,
        "utf-8",
      ),
    );
    const vaults: Record<string, { path: string; open?: boolean }> =
      obsidianConfig.vaults || {};

    // Prefer currently open vault
    for (const vault of Object.values(vaults)) {
      if (vault.open && existsSync(vault.path)) return vault.path;
    }
    // Fall back to first available
    for (const vault of Object.values(vaults)) {
      if (existsSync(vault.path)) return vault.path;
    }
  } catch {
    // config not readable
  }

  // Common paths
  const commonPaths = [
    `${homedir()}/Documents/Obsidian Vault`,
    `${homedir()}/Documents/myObKB`,
    `${homedir()}/Obsidian`,
    process.env.OBSIDIAN_VAULT,
  ].filter(Boolean) as string[];

  for (const path of commonPaths) {
    if (existsSync(path)) return path;
  }

  return null;
}

function listHandoffFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => pjoin(dir, f));
}
