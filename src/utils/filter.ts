import type { Handoff, HandoffStatus } from "../core/schema.js";
import { toSummary } from "../core/schema.js";

export function filterHandoffs(
  handoffs: Handoff[],
  filter?: {
    project?: string;
    status?: HandoffStatus;
    labels?: string[];
    limit?: number;
  },
) {
  let filtered = handoffs;
  if (filter?.status) {
    filtered = filtered.filter((h) => h.status === filter.status);
  }
  if (filter?.project) {
    filtered = filtered.filter((h) => h.project === filter.project);
  }
  if (filter?.labels && filter.labels.length > 0) {
    filtered = filtered.filter((h) =>
      filter.labels!.some((l) => h.labels.includes(l)),
    );
  }
  filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (filter?.limit) {
    filtered = filtered.slice(0, filter.limit);
  }
  return filtered.map(toSummary);
}

export function applyPatch(handoff: Handoff, patch: Partial<Handoff>): Handoff {
  return { ...handoff, ...patch, updated_at: new Date().toISOString() };
}
