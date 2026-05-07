import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join as pjoin } from "node:path";

export type AgentctxConfig = {
  defaultBackend?: "fs" | "github" | "obsidian";
  githubRepo?: string;
  obsidianVault?: string;
  project?: string;
  agentName?: string;
};

const defaultConfig: AgentctxConfig = {};

export function configPaths(cwd: string): { user: string; project: string } {
  return {
    user: pjoin(homedir(), ".agentctx", "config.json"),
    project: pjoin(cwd, ".agentctx", "config.json"),
  };
}

function loadFile(path: string): AgentctxConfig {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AgentctxConfig;
  } catch {
    return {};
  }
}

function saveFile(path: string, config: AgentctxConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function loadConfig(cwd: string): AgentctxConfig {
  const paths = configPaths(cwd);
  const userConfig = loadFile(paths.user);
  const projectConfig = loadFile(paths.project);
  return { ...defaultConfig, ...userConfig, ...projectConfig };
}

export function saveUserConfig(partial: AgentctxConfig): AgentctxConfig {
  const path = pjoin(homedir(), ".agentctx", "config.json");
  const existing = loadFile(path);
  const merged = { ...existing, ...partial };
  saveFile(path, merged);
  return merged;
}

export function saveProjectConfig(cwd: string, partial: AgentctxConfig): AgentctxConfig {
  const path = pjoin(cwd, ".agentctx", "config.json");
  const existing = loadFile(path);
  const merged = { ...existing, ...partial };
  saveFile(path, merged);
  return merged;
}
