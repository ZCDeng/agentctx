import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Handoff } from "./schema.js";
import { parse } from "./formatter.js";
import { serialize } from "./formatter.js";

export function linkPrevious(
  handoff: Handoff,
  previousHandoffs: Handoff[],
): Handoff {
  if (previousHandoffs.length === 0) return handoff;

  const latest = previousHandoffs.reduce((a, b) =>
    a.updated_at > b.updated_at ? a : b,
  );

  return {
    ...handoff,
    previous_handoff: latest.id,
  };
}

export function patchNextField(
  previousHandoff: Handoff,
  nextId: string,
  loadHandoff: (id: string) => Handoff | null,
  saveHandoff: (h: Handoff) => void,
): void {
  const updated: Handoff = {
    ...previousHandoff,
    next_handoff: nextId,
  };
  saveHandoff(updated);
}

export function resolveChain(
  handoff: Handoff,
  loadHandoff: (id: string) => Handoff | null,
  maxLength = 10,
): Handoff[] {
  const chain: Handoff[] = [handoff];
  const seen = new Set<string>([handoff.id]);

  // Walk backward
  let current = handoff;
  while (current.previous_handoff && chain.length < maxLength) {
    const prev = loadHandoff(current.previous_handoff);
    if (!prev || seen.has(prev.id)) break;
    seen.add(prev.id);
    chain.unshift(prev);
    current = prev;
  }

  // Walk forward
  current = handoff;
  while (current.next_handoff && chain.length < maxLength) {
    const next = loadHandoff(current.next_handoff);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    chain.push(next);
    current = next;
  }

  return chain;
}
