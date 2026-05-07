import { z } from "zod";

export const HandoffStatus = z.enum([
  "pending",
  "in-progress",
  "blocked",
  "done",
  "abandoned",
]);
export type HandoffStatus = z.infer<typeof HandoffStatus>;

export const AgentTreeNodeSchema = z.object({
  role: z.string(),
  agent: z.string(),
  session_id: z.string().optional(),
  summary: z.string(),
  findings: z.string().optional(),
  tokens: z.number().optional(),
});
export type AgentTreeNode = z.infer<typeof AgentTreeNodeSchema>;

export const HandoffSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: HandoffStatus,
  agent: z.string().default("unknown"),
  project: z.string().optional(),
  labels: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  session_id: z.string().optional(),
  git_branch: z.string().optional(),
  git_commit: z.string().optional(),
  files_modified: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  estimated_effort: z.string().optional(),
  previous_handoff: z.string().uuid().optional(),
  next_handoff: z.string().uuid().optional(),
  agent_tree: z.array(AgentTreeNodeSchema).default([]),
  total_tokens: z.number().optional(),
  agent_count: z.number().optional(),
  duration: z.string().optional(),
  body: z.string().default(""),
});
export type Handoff = z.infer<typeof HandoffSchema>;

export const HandoffSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: HandoffStatus,
  agent: z.string(),
  project: z.string().optional(),
  labels: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  git_branch: z.string().optional(),
  estimated_effort: z.string().optional(),
});
export type HandoffSummary = z.infer<typeof HandoffSummarySchema>;

export function toSummary(h: Handoff): HandoffSummary {
  return {
    id: h.id,
    title: h.title,
    status: h.status,
    agent: h.agent,
    project: h.project,
    labels: h.labels,
    created_at: h.created_at,
    updated_at: h.updated_at,
    git_branch: h.git_branch,
    estimated_effort: h.estimated_effort,
  };
}
