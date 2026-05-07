import matter from "gray-matter";
import { HandoffSchema, type Handoff } from "./schema.js";

export function serialize(handoff: Handoff): string {
  const {
    body,
    id,
    title,
    status,
    agent,
    project,
    labels,
    created_at,
    updated_at,
    session_id,
    git_branch,
    git_commit,
    files_modified,
    dependencies,
    estimated_effort,
    previous_handoff,
    next_handoff,
    agent_tree,
    total_tokens,
    agent_count,
    duration,
  } = handoff;

  const frontmatter: Record<string, unknown> = {
    id,
    title,
    status,
    agent,
    ...(project && { project }),
    labels,
    created_at,
    updated_at,
    ...(session_id && { session_id }),
    ...(git_branch && { git_branch }),
    ...(git_commit && { git_commit }),
    files_modified,
    dependencies,
    ...(estimated_effort && { estimated_effort }),
    ...(previous_handoff && { previous_handoff }),
    ...(next_handoff && { next_handoff }),
    ...(agent_tree.length > 0 && { agent_tree }),
    ...(total_tokens != null && { total_tokens }),
    ...(agent_count != null && { agent_count }),
    ...(duration && { duration }),
  };

  return matter.stringify(body.trimEnd() + "\n", frontmatter);
}

export function parse(content: string): Handoff {
  const { data, content: body } = matter(content);

  const handoff = HandoffSchema.parse({
    ...data,
    body: body.trim(),
  });

  return handoff;
}

export function parseSafe(content: string): Handoff | null {
  try {
    return parse(content);
  } catch {
    return null;
  }
}
