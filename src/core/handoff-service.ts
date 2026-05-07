import { uuid } from "../utils/uuid.js";
import { loadConfig } from "../utils/config.js";
import { resolveBackend } from "../backends/resolver.js";
import { toSummary, type Handoff, type HandoffStatus } from "./schema.js";
import {
  gatherGitContext,
  detectAgent,
  detectSessionId,
  detectProject,
} from "./context-gatherer.js";
import { discoverAgentTree } from "./agent-tree-gatherer.js";
import { resolveChain } from "./chain-builder.js";
import { renderJSON, renderContextPrompt, renderMarkdown, renderTable } from "../output/formatter.js";

export type SaveOptions = {
  message: string;
  title?: string;
  labels?: string[];
  tree?: boolean;
  maxTreeDepth?: number;
  backend?: string;
};

export async function save(
  cwd: string,
  opts: SaveOptions,
): Promise<{ id: string; ref: string; file: string }> {
  const config = loadConfig(cwd);
  const { backend } = await resolveBackend(cwd, config, opts.backend);

  const [agent, sessionId, gitCtx, projectName] = await Promise.all([
    detectAgent(),
    detectSessionId(),
    gatherGitContext(cwd),
    Promise.resolve(config.project || detectProject(cwd)),
  ]);

  const now = new Date().toISOString();
  const id = uuid();

  let handoff: Handoff = {
    id,
    title: opts.title || opts.message.slice(0, 80),
    status: "in-progress",
    agent: config.agentName || agent,
    project: projectName,
    labels: opts.labels || [],
    created_at: now,
    updated_at: now,
    session_id: sessionId,
    git_branch: gitCtx.branch,
    git_commit: gitCtx.commit,
    files_modified: gitCtx.filesModified,
    dependencies: [],
    estimated_effort: undefined,
    previous_handoff: undefined,
    next_handoff: undefined,
    agent_tree: [],
    total_tokens: undefined,
    agent_count: undefined,
    duration: undefined,
    body: `# ${opts.title || "Handoff"}\n\n${opts.message}\n`,
  };

  if (opts.tree && sessionId) {
    const tree = await discoverAgentTree(sessionId, agent, {
      maxDepth: opts.maxTreeDepth ?? 2,
    });
    handoff.agent_tree = tree;
    handoff.agent_count = tree.length;
  }

  // Auto-link to previous handoff in same project
  try {
    const previousList = await backend.list({ project: projectName, limit: 1 });
    if (previousList.length > 0) {
      handoff.previous_handoff = previousList[0].id;
    }
  } catch {
    // No previous handoffs, skip linking
  }

  const result = await backend.save(handoff);
  return { ...result, file: renderMarkdown(handoff) };
}

export async function load(
  cwd: string,
  opts: {
    idOrLast: string;
    backend?: string;
    chain?: boolean;
    format?: string;
  },
): Promise<string> {
  const config = loadConfig(cwd);
  const { backend } = await resolveBackend(cwd, config, opts.backend);

  const handoff = await backend.load(opts.idOrLast);

  if (opts.chain) {
    const chain = await resolveChain(handoff, async (id: string) => {
      try { return await backend.load(id); } catch { return null; }
    });
    // Combine chain into single context prompt
    const parts = chain.map((h, i) =>
      `=== Handoff ${i + 1}/${chain.length}: ${h.title} (${h.status}) ===\n\n${h.body}`,
    );
    return parts.join("\n\n");
  }

  return formatOutput(handoff, opts.format || "markdown");
}

export async function listCommand(
  cwd: string,
  opts: {
    status?: string;
    labels?: string[];
    backend?: string;
    format?: string;
  },
): Promise<string> {
  const config = loadConfig(cwd);
  const { backend } = await resolveBackend(cwd, config, opts.backend);

  const handoffs = await backend.list({
    status: opts.status as HandoffStatus | undefined,
    labels: opts.labels,
  });

  if (opts.format === "json") {
    return JSON.stringify(handoffs, null, 2);
  }

  return renderTable(handoffs);
}

export async function statusCommand(
  cwd: string,
  opts: {
    idOrLast: string;
    status: HandoffStatus;
    backend?: string;
  },
): Promise<string> {
  const config = loadConfig(cwd);
  const { backend } = await resolveBackend(cwd, config, opts.backend);

  await backend.update(opts.idOrLast, {
    status: opts.status,
    updated_at: new Date().toISOString(),
  } as Partial<Handoff>);

  return `Status updated: ${opts.idOrLast} → ${opts.status}`;
}

function formatOutput(handoff: Handoff, format: string): string {
  switch (format) {
    case "json":
      return renderJSON(handoff);
    case "context-prompt":
      return renderContextPrompt(handoff);
    default:
      return renderMarkdown(handoff);
  }
}
