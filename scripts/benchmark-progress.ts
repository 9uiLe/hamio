import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [output, baseline, candidate, countText = "5"] = process.argv.slice(2);
const count = Number(countText);
if (!output || !baseline || !candidate || !Number.isInteger(count) || count < 3 || count > 20)
  throw new Error("Usage: benchmark-progress.ts OUTPUT BASELINE CANDIDATE COUNT");
const binaries = { baseline: resolve(baseline), candidate: resolve(candidate) };
type Variant = keyof typeof binaries;
const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const binaryHashes = {
  baseline: hash(await Bun.file(binaries.baseline).bytes()),
  candidate: hash(await Bun.file(binaries.candidate).bytes()),
};
const scriptHash = hash(await Bun.file(import.meta.path).bytes());
const frames = 10;
const intervalMs = 150;
const input: string[] = [];
function event(type: string, data: Record<string, unknown>) {
  input.push(
    `${JSON.stringify({ apiVersion: 1, runId: "bench", seq: input.length, type, ...data })}\n`,
  );
}
event("run.start", { title: "progress benchmark" });
event("task.start", { taskId: "task", label: "work" });
for (let index = 0; index < frames; index++)
  event("task.progress", { taskId: "task", current: 1, total: 100 });
event("task.finish", { taskId: "task", status: "succeeded" });
event("run.finish", { result: { success: true } });

async function sample(binary: string) {
  const directory = await mkdtemp(join(tmpdir(), "hamio-progress-"));
  const fifo = join(directory, "input");
  const made = Bun.spawnSync(["mkfifo", fifo]);
  if (made.exitCode !== 0) throw new Error("Could not create benchmark pipe.");
  let text = "";
  const decoder = new TextDecoder();
  const started = performance.now();
  const child = Bun.spawn(
    [
      "sh",
      "-c",
      'input=$1; shift; exec "$@" < "$input"',
      "benchmark",
      fifo,
      binary,
      "stream",
      "--format",
      "human",
      "--color",
      "never",
    ],
    {
      timeout: 8000,
      env: { PATH: process.env.PATH ?? "", TERM: "xterm-256color", HOME: directory },
      terminal: {
        cols: 80,
        rows: 24,
        data(_terminal, bytes) {
          text += decoder.decode(bytes, { stream: true });
          if (text.length > 64 * 1024) child.kill();
        },
      },
    },
  );
  const writer = createWriteStream(fifo);
  try {
    await once(writer, "open");
    for (let index = 0; index < input.length; index++) {
      const line = input[index];
      if (!line) throw new Error("Missing benchmark event.");
      await new Promise<void>((done, reject) =>
        writer.write(line, (error) => (error ? reject(error) : done())),
      );
      if (index >= 2 && index < 2 + frames) await Bun.sleep(intervalMs);
    }
    writer.end();
    const code = await child.exited;
    const usage = child.resourceUsage();
    if (code !== 0 || !usage || !text.includes('"status":"ok"') || !text.includes('"succeeded":1'))
      throw new Error(`Progress benchmark failed (${code}).`);
    return {
      wallMs: performance.now() - started,
      cpuMs: Number(usage.cpuTime.total) / 1000,
      peakRssBytes: Number(usage.maxRSS),
      outputBytes: Buffer.byteLength(text),
      progressFrames: text.split("work 1/100").length - 1,
    };
  } finally {
    writer.destroy();
    child.kill();
    await child.exited;
    child.terminal?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const samples: Record<Variant, Awaited<ReturnType<typeof sample>>[]> = {
  baseline: [],
  candidate: [],
};
for (const variant of ["baseline", "candidate"] as const) await sample(binaries[variant]);
for (let index = 0; index < count; index++) {
  const order: Variant[] = index % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"];
  for (const variant of order) samples[variant].push(await sample(binaries[variant]));
}
for (const variant of ["baseline", "candidate"] as const)
  if (hash(await Bun.file(binaries[variant]).bytes()) !== binaryHashes[variant])
    throw new Error("Executable changed during measurement.");
const metrics = ["wallMs", "cpuMs", "peakRssBytes", "outputBytes", "progressFrames"] as const;
const summary = Object.fromEntries(
  Object.entries(samples).map(([variant, values]) => {
    const median = (key: keyof (typeof values)[number]) =>
      values.map((value) => value[key]).sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return [variant, Object.fromEntries(metrics.map((key) => [key, median(key)]))];
  }),
);
if (hash(await Bun.file(import.meta.path).bytes()) !== scriptHash)
  throw new Error("Benchmark script changed during measurement.");
const report = {
  scriptSha256: scriptHash,
  timestamp: new Date().toISOString(),
  binaries: binaryHashes,
  inputSha256: hash(input.join("")),
  runtime: {
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    cpu: cpus()[0]?.model,
  },
  conditions: {
    count,
    warmup: 1,
    frames,
    intervalMs,
    terminal: "80 columns, 24 rows; stdout/stderr combined; process stdin is a FIFO",
    wallTime: "Includes scripted sender pacing; not render latency",
  },
  summary,
  samples,
};
await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summary));
