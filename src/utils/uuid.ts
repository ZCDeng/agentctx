import { randomUUID } from "node:crypto";

export function uuid(): string {
  return randomUUID();
}

export function id8(id?: string): string {
  return (id ?? uuid()).slice(0, 8);
}
