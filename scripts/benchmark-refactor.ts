import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const [outputPath, baselinePath, candidatePath, countText = "30", baselineCommit] =
  process.argv.slice(2);
const count = Number(countText);
if (
  !outputPath ||
  !baselinePath ||
  !candidatePath ||
  !baselineCommit ||
  !Number.isInteger(count) ||
  count < 5 ||
  count > 100
)
  throw new Error("Usage: benchmark-refactor.ts OUTPUT BASELINE CANDIDATE COUNT BASELINE_COMMIT");
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const binaries = { baseline: resolve(baselinePath), candidate: resolve(candidatePath) };
type Variant = keyof typeof binaries;
const variants: Variant[] = ["baseline", "candidate"];
const directory = await mkdtemp(join(tmpdir(), "hamio-benchmark-"));
const form = {
  apiVersion: 1,
  id: "bench",
  fields: [{ id: "value", kind: "text", label: "benchmark input" }],
};
const definitionPath = join(directory, "form.json");
await Bun.write(definitionPath, JSON.stringify(form));

function stream(progressCount: number): string {
  let seq = 0;
  const lines: string[] = [];
  const add = (type: string, data: Record<string, unknown>) =>
    lines.push(JSON.stringify({ apiVersion: 1, runId: "bench", seq: seq++, type, ...data }));
  add("run.start", { title: "benchmark" });
  for (let i = 0; i < 100; i++) add("task.start", { taskId: `t${i}`, label: "work" });
  for (let i = 0; i < progressCount; i++)
    add("task.progress", {
      taskId: `t${i % 100}`,
      current: Math.floor(i / 100) + 1,
      total: Math.ceil(progressCount / 100),
    });
  for (let i = 0; i < 100; i++) add("task.finish", { taskId: `t${i}`, status: "succeeded" });
  add("run.finish", { result: { success: true } });
  return `${lines.join("\n")}\n`;
}
const table = {
  kind: "table",
  columns: Array.from({ length: 4 }, (_, column) => ({ id: `c${column}`, label: `列 ${column}` })),
  rows: Array.from({ length: 20 }, (_, row) =>
    Object.fromEntries(
      Array.from({ length: 4 }, (_, column) => [`c${column}`, `行 ${row}・列 ${column}`]),
    ),
  ),
};
const dense = JSON.stringify({ apiVersion: 1, blocks: Array.from({ length: 32 }, () => table) });
interface Case {
  name: string;
  args: string[];
  input: string;
  jobs: number;
  terminal?: boolean;
}
const cases: Case[] = [
  { name: "capabilities", args: ["capabilities"], input: "", jobs: 1 },
  {
    name: "form",
    args: ["form", "--definition", definitionPath, "--values", "-", "--interactive", "never"],
    input: '{"value":"日本語"}',
    jobs: 1,
  },
  {
    name: "render-json",
    args: ["render", "--format", "json"],
    input: JSON.stringify({ apiVersion: 1, blocks: [table] }),
    jobs: 1,
  },
  {
    name: "render-32-tables",
    args: ["render", "--format", "human", "--color", "never"],
    input: dense,
    jobs: 1,
  },
  { name: "stream-2000", args: ["stream", "--format", "json"], input: stream(2000), jobs: 1 },
  {
    name: "stream-20000-events",
    args: ["stream", "--format", "json", "--events"],
    input: stream(20000),
    jobs: 1,
  },
  {
    name: "four-streams-20000",
    args: ["stream", "--format", "json"],
    input: stream(20000),
    jobs: 4,
  },
  {
    name: "form-pty",
    args: ["form", "--definition", definitionPath, "--interactive", "always", "--color", "never"],
    input: "日本語\r",
    jobs: 1,
    terminal: true,
  },
];
interface Sample {
  wallMs: number;
  cpuMs: number;
  sumPeakRssBytes: number;
  stdoutBytes: number;
  stderrBytes: number;
  outputSha256?: string;
  readyMs?: number;
  inputResponseMs?: number;
}
async function pipeSample(binary: string, entry: Case): Promise<Sample> {
  const started = performance.now();
  const child = Bun.spawn([binary, ...entry.args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
    env: { PATH: process.env.PATH ?? "", TERM: "dumb" },
  });
  child.stdin.write(entry.input);
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).bytes(),
    new Response(child.stderr).bytes(),
  ]);
  const wallMs = performance.now() - started;
  if (code !== 0) throw new Error(`${entry.name}: exit ${code}`);
  const usage = child.resourceUsage();
  if (!usage) throw new Error("Resource usage is unavailable.");
  return {
    wallMs,
    cpuMs: Number(usage.cpuTime.total) / 1000,
    sumPeakRssBytes: Number(usage.maxRSS),
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
    outputSha256: hash(Buffer.concat([stdout, Buffer.from([0]), stderr])),
  };
}
async function terminalSample(binary: string, entry: Case): Promise<Sample> {
  const started = performance.now();
  let ready: number | undefined;
  let response: number | undefined;
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  const child = Bun.spawn([binary, ...entry.args], {
    env: { PATH: process.env.PATH ?? "", TERM: "xterm-256color" },
    timeout: 15_000,
    terminal: {
      cols: 80,
      rows: 24,
      data(terminal, chunk) {
        bytes += chunk.byteLength;
        text += decoder.decode(chunk, { stream: true });
        if (bytes > 1024 * 1024) throw new Error("Unexpected terminal output volume.");
        if (ready === undefined && text.includes("benchmark input")) {
          ready = performance.now();
          terminal.write(entry.input);
        }
        if (response === undefined && text.includes('"status":"ok"')) response = performance.now();
      },
    },
  });
  try {
    const code = await child.exited;
    const wallMs = performance.now() - started;
    const usage = child.resourceUsage();
    if (
      code !== 0 ||
      ready === undefined ||
      response === undefined ||
      !usage ||
      !text.includes('"value":"日本語"')
    )
      throw new Error("Interactive benchmark failed.");
    return {
      wallMs,
      readyMs: ready - started,
      inputResponseMs: response - ready,
      cpuMs: Number(usage.cpuTime.total) / 1000,
      sumPeakRssBytes: Number(usage.maxRSS),
      stdoutBytes: bytes,
      stderrBytes: 0,
    };
  } finally {
    child.terminal?.close();
  }
}
async function sample(binary: string, entry: Case): Promise<Sample> {
  if (entry.terminal) return terminalSample(binary, entry);
  if (entry.jobs === 1) return pipeSample(binary, entry);
  const started = performance.now();
  const results = await Promise.all(
    Array.from({ length: entry.jobs }, () => pipeSample(binary, entry)),
  );
  const total: Sample = {
    wallMs: performance.now() - started,
    cpuMs: 0,
    sumPeakRssBytes: 0,
    stdoutBytes: 0,
    stderrBytes: 0,
  };
  for (const result of results) {
    total.cpuMs += result.cpuMs;
    total.sumPeakRssBytes += result.sumPeakRssBytes;
    total.stdoutBytes += result.stdoutBytes;
    total.stderrBytes += result.stderrBytes;
  }
  total.outputSha256 = hash(results.map((result) => result.outputSha256).join("\n"));
  return total;
}
function summary(samples: Sample[]) {
  const quantile = (key: keyof Sample, q: number) => {
    const numbers = samples
      .map((sample) => sample[key])
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);
    return numbers[Math.ceil(numbers.length * q) - 1];
  };
  return {
    medianMs: quantile("wallMs", 0.5),
    p95Ms: quantile("wallMs", 0.95),
    medianCpuMs: quantile("cpuMs", 0.5),
    medianSumPeakRssBytes: quantile("sumPeakRssBytes", 0.5),
    stdoutBytes: quantile("stdoutBytes", 0.5),
    stderrBytes: quantile("stderrBytes", 0.5),
    medianReadyMs: quantile("readyMs", 0.5),
    p95ReadyMs: quantile("readyMs", 0.95),
    medianInputResponseMs: quantile("inputResponseMs", 0.5),
    p95InputResponseMs: quantile("inputResponseMs", 0.95),
    samples,
  };
}

async function sourceHashes() {
  const files = [
    "package.json",
    "bun.lock",
    "flake.nix",
    "flake.lock",
    "scripts/build.ts",
    "scripts/package.ts",
    "scripts/benchmark-refactor.ts",
  ];
  for (const pattern of ["src/**/*.ts", "scripts/build/**/*.ts", "scripts/release/**/*"]) {
    for await (const path of new Bun.Glob(pattern).scan({ cwd: ".", onlyFiles: true }))
      files.push(path);
  }
  return Object.fromEntries(
    await Promise.all(files.sort().map(async (path) => [path, hash(await Bun.file(path).bytes())])),
  );
}

try {
  const sources = await sourceHashes();
  const binaryHashes = await Promise.all(
    variants.map(async (variant) => hash(await Bun.file(binaries[variant]).bytes())),
  );
  const results = [];
  for (const entry of cases) {
    for (let warm = 0; warm < 2; warm++)
      for (const variant of variants) await sample(binaries[variant], entry);
    const samples: Record<Variant, Sample[]> = { baseline: [], candidate: [] };
    for (let index = 0; index < count; index++) {
      for (const variant of index % 2 ? [...variants].reverse() : variants)
        samples[variant].push(await sample(binaries[variant], entry));
    }
    if (
      !entry.terminal &&
      new Set([...samples.baseline, ...samples.candidate].map((sample) => sample.outputSha256))
        .size !== 1
    )
      throw new Error(`${entry.name}: output changed between variants or trials`);
    const result = {
      name: entry.name,
      jobs: entry.jobs,
      terminal: !!entry.terminal,
      args: entry.args.map((value) => (value === definitionPath ? "<form.json>" : value)),
      inputBytes: Buffer.byteLength(entry.input),
      inputSha256: hash(entry.input),
      baseline: summary(samples.baseline),
      candidate: summary(samples.candidate),
    };
    results.push(result);
    console.log(
      JSON.stringify({
        ...result,
        baseline: { ...result.baseline, samples: undefined },
        candidate: { ...result.candidate, samples: undefined },
      }),
    );
  }
  if (JSON.stringify(sources) !== JSON.stringify(await sourceHashes()))
    throw new Error("Sources changed during measurement.");
  const sizes = Object.fromEntries(
    await Promise.all(
      variants.map(async (variant, index) => {
        const bytes = await Bun.file(binaries[variant]).bytes();
        if (hash(bytes) !== binaryHashes[index])
          throw new Error("A binary changed during measurement.");
        return [
          variant,
          {
            sha256: hash(bytes),
            binaryBytes: bytes.length,
            gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
          },
        ];
      }),
    ),
  );
  const report = {
    timestamp: new Date().toISOString(),
    baselineCommit,
    candidateSources: sources,
    sizes,
    runtime: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      ramBytes: totalmem(),
    },
    conditions: {
      warmup: 2,
      count,
      order: "alternating baseline/candidate within each pair",
      rss: "sum of each child process peak RSS; not simultaneous physical memory",
      pty: "stdout/stderr merged into terminal output; scripted input, no human wait",
      compression: "node:zlib gzip level 9, same settings as scripts/package.ts",
      form,
    },
    cases: results,
  };
  await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
