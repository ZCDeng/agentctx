import type { Handoff } from "./schema.js";

export async function resolveChain(
  handoff: Handoff,
  loadHandoff: (id: string) => Promise<Handoff | null>,
  maxLength = 10,
): Promise<Handoff[]> {
  const chain: Handoff[] = [handoff];
  const seen = new Set<string>([handoff.id]);

  // Walk backward
  let current = handoff;
  while (current.previous_handoff && chain.length < maxLength) {
    const prev = await loadHandoff(current.previous_handoff);
    if (!prev || seen.has(prev.id)) break;
    seen.add(prev.id);
    chain.unshift(prev);
    current = prev;
  }

  // Walk forward
  current = handoff;
  while (current.next_handoff && chain.length < maxLength) {
    const next = await loadHandoff(current.next_handoff);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    chain.push(next);
    current = next;
  }

  return chain;
}
