import type { Handoff, HandoffSummary, HandoffStatus } from "../core/schema.js";

export interface HandoffBackend {
  readonly name: "fs" | "github" | "obsidian";

  probe(): Promise<{ ok: boolean; reason?: string }>;

  save(handoff: Handoff): Promise<{ id: string; ref: string }>;

  load(idOrLast: string): Promise<Handoff>;

  list(filter?: {
    project?: string;
    status?: HandoffStatus;
    labels?: string[];
    limit?: number;
  }): Promise<HandoffSummary[]>;

  update(
    id: string,
    patch: Partial<Handoff>,
  ): Promise<Handoff>;
}
