import { spawn } from "node:child_process";

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export function exec(
  command: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 255 });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

export async function execOk(
  command: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<string> {
  const result = await exec(command, args, opts);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.code}: ${result.stderr}`,
    );
  }
  return result.stdout;
}
