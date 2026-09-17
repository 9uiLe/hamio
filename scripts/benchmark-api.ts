import { createHash } from "node:crypto";
import { cpus, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { sourceHashes } from "./preview/artifacts.ts";

const output = process.argv[2] ?? "dist/benchmarks/api.json";
const count = Number(process.argv[3] ?? "30");
if (!Number.isInteger(count) || count < 5 || count > 100)
  throw new Error("Use 5..100 measured samples.");
const binary = resolve("dist/hamio");
const stream = (progressCount: number) => {
  let seq = 0;
  const lines: string[] = [];
  const add = (type: string, data: Record<string, unknown>) =>
    lines.push(JSON.stringify({ apiVersion: 1, runId: "bench", seq: seq++, type, ...data }));
  add("run.start", { title: "benchmark" });
  for (let task = 0; task < 100; task++) add("task.start", { taskId: `t${task}`, label: "work" });
  for (let i = 0; i < progressCount; i++)
    add("task.progress", {
      taskId: `t${i % 100}`,
      current: Math.floor(i / 100) + 1,
      total: Math.ceil(progressCount / 100),
    });
  for (let task = 0; task < 100; task++)
    add("task.finish", { taskId: `t${task}`, status: "succeeded" });
  add("run.finish", { result: { success: true } });
  return `${lines.join("\n")}\n`;
};
const cases = [
  { name: "capabilities", args: ["capabilities"], input: "" },
  {
    name: "form",
    args: ["form", "--definition", "examples/form.json", "--values", "-", "--interactive", "never"],
    input: '{"environment":"local","approved":false}',
  },
  {
    name: "render",
    args: ["render", "--format", "json", "--input", "examples/display.json"],
    input: "",
  },
  { name: "stream-100-tasks", args: ["stream", "--format", "json"], input: stream(0) },
  { name: "stream-2000-progress", args: ["stream", "--format", "json"], input: stream(2000) },
  {
    name: "stream-2000-events",
    args: ["stream", "--format", "json", "--events"],
    input: stream(2000),
  },
];
async function sample(entry: (typeof cases)[number]) {
  const started = performance.now();
  const child = Bun.spawn([binary, ...entry.args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  child.stdin.write(entry.input);
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).bytes(),
    new Response(child.stderr).bytes(),
  ]);
  if (code !== 0) throw new Error(`${entry.name} failed with exit code ${code}`);
  const usage = child.resourceUsage();
  if (!usage) throw new Error("Resource measurement is unavailable.");
  return {
    wallMs: performance.now() - started,
    cpuMs: Number(usage.cpuTime.total) / 1000,
    maxRssBytes: Number(usage.maxRSS),
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
  };
}
const results = [];
for (const entry of cases) {
  for (let warm = 0; warm < 2; warm++) await sample(entry);
  const samples: Awaited<ReturnType<typeof sample>>[] = [];
  for (let i = 0; i < count; i++) samples.push(await sample(entry));
  const quantile = (field: keyof (typeof samples)[number], q: number) =>
    samples.map((sample) => sample[field]).sort((a, b) => a - b)[Math.ceil(count * q) - 1];
  const result = {
    name: entry.name,
    args: entry.args,
    inputBytes: Buffer.byteLength(entry.input),
    inputSha256: createHash("sha256").update(entry.input).digest("hex"),
    medianMs: quantile("wallMs", 0.5),
    p95Ms: quantile("wallMs", 0.95),
    medianCpuMs: quantile("cpuMs", 0.5),
    medianMaxRssBytes: quantile("maxRssBytes", 0.5),
    stdoutBytes: samples[0]?.stdoutBytes,
    stderrBytes: samples[0]?.stderrBytes,
    samples,
  };
  results.push(result);
  console.log(JSON.stringify({ ...result, samples: undefined }));
}
await Bun.write(
  output,
  `${JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      commit: Bun.spawnSync(["git", "rev-parse", "HEAD"]).stdout.toString().trim(),
      sources: {
        ...(await sourceHashes()),
        ...Object.fromEntries(
          await Promise.all(
            ["scripts/build.ts", "scripts/benchmark-api.ts"].map(async (path) => [
              path,
              createHash("sha256")
                .update(await Bun.file(path).bytes())
                .digest("hex"),
            ]),
          ),
        ),
      },
      binarySha256: createHash("sha256")
        .update(await Bun.file(binary).bytes())
        .digest("hex"),
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      ramBytes: totalmem(),
      warmup: 2,
      count,
      cases: results,
    },
    null,
    2,
  )}\n`,
);
