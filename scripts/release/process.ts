/** Build subprocesses have a time limit and capped diagnostics. The product never imports this. */
export async function run(
  command: string[],
  cwd: string,
  extra: Record<string, string> = {},
): Promise<string> {
  const env = { ...process.env, ...extra };
  delete env.BUN_OPTIONS;
  delete env.BUN_BE_BUN;
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
    const parts: Uint8Array[] = [];
    let bytes = 0;
    for await (const part of stream) {
      bytes += part.byteLength;
      if (bytes > 2 * 1024 * 1024) throw new Error("Build subprocess output exceeded its limit.");
      parts.push(part);
    }
    return Buffer.concat(parts, bytes).toString("utf8");
  }
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      read(child.stdout),
      read(child.stderr),
    ]);
    if (code !== 0)
      throw new Error(`${command[0]} failed (${code}): ${(stderr || stdout).slice(0, 8192)}`);
    return stdout.trim();
  } catch (error) {
    child.kill();
    await child.exited;
    throw error;
  }
}
