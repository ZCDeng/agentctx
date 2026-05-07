import type { Handoff, HandoffSummary } from "../core/schema.js";
import { serialize as serializeHandoff } from "../core/formatter.js";

export function renderJSON(handoff: Handoff): string {
  return JSON.stringify(handoff, null, 2);
}

export function renderContextPrompt(handoff: Handoff): string {
  const lines = [
    `[This session continues work from a previous AI coding session.]`,
    `Handoff: "${handoff.title}" (status: ${handoff.status})`,
    `Agent: ${handoff.agent} | Project: ${handoff.project || "unknown"}`,
    `Branch: ${handoff.git_branch || "unknown"} | Commit: ${handoff.git_commit || "unknown"}`,
  ];

  if (handoff.agent_tree.length > 0) {
    lines.push(`Agent cluster: ${handoff.agent_count || handoff.agent_tree.length} sub-agents`);
    for (const node of handoff.agent_tree) {
      lines.push(`  - ${node.role} (${node.agent}): ${node.summary.slice(0, 100)}`);
    }
  }

  if (handoff.previous_handoff) {
    lines.push(`Previous handoff: ${handoff.previous_handoff.slice(0, 8)}`);
  }

  lines.push("", "---", "", handoff.body);
  return lines.join("\n");
}

export function renderMarkdown(handoff: Handoff): string {
  return serializeHandoff(handoff);
}

export function renderTable(handoffs: HandoffSummary[]): string {
  if (handoffs.length === 0) return "No handoffs found.";

  const header = ["ID", "STATUS", "TITLE", "UPDATED", "AGENT"];
  const rows = handoffs.map((h) => [
    h.id.slice(0, 8),
    h.status,
    h.title.slice(0, 50),
    h.updated_at.slice(0, 10),
    h.agent,
  ]);

  const widths = header.map((_, i) =>
    Math.max(header[i].length, ...rows.map((r) => r[i].length)),
  );

  const pad = (s: string, w: number) => s.padEnd(w);
  const sep = widths.map((w) => "-".repeat(w)).join(" | ");
  const headerLine = header.map((h, i) => pad(h, widths[i])).join(" | ");
  const lines = [headerLine, sep];
  for (const row of rows) {
    lines.push(row.map((r, i) => pad(r, widths[i])).join(" | "));
  }
  return lines.join("\n");
}
