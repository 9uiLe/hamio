import { cpus, release, totalmem } from "node:os";
import { sourceHashes } from "./preview/artifacts.ts";

// Run inside nix develop .#preview. Each sample launches a new process, sequentially.
const [output, countText = "15", ...selected] = process.argv.slice(2);
const count = Number(countText);
if (!output || !Number.isInteger(count) || count < 5 || count > 100) {
  throw new Error("Usage: bun scripts/benchmark-preview.ts OUTPUT.json [5..100] [CASE ...]");
}
const bun = process.execPath;
const cases = [
  { name: "check", command: [bun, "run", "preview:check"] },
  { name: "tests", command: [bun, "test", "tests/preview.test.ts"] },
  { name: "generate", command: [bun, "scripts/preview/generate.ts"] },
  { name: "recording", command: [bun, "scripts/preview/generate.ts", "--recording"] },
  { name: "wrapper", command: ["./scripts/preview.sh"], wrapper: true },
  { name: "rebuild", command: [bun, "scripts/preview/generate.ts", "--force"] },
  {
    name: "rebuild-recording",
    command: [bun, "scripts/preview/generate.ts", "--force", "--recording"],
  },
  { name: "wrapper-rebuild", command: ["./scripts/preview.sh", "--force"], wrapper: true },
];
if (selected.some((name) => !cases.some((entry) => entry.name === name))) {
  throw new Error(`Unknown case; choose ${cases.map(({ name }) => name).join(", ")}`);
}
async function run(entry: (typeof cases)[number]) {
  const env = { ...process.env };
  if (entry.wrapper) {
    delete env.HAMIO_PREVIEW_SHELL;
    delete env.HAMIO_DEV_SHELL;
  }
  const started = performance.now();
  const child = Bun.spawn(entry.command, { env, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${entry.name}: ${stdout}\n${stderr}`);
  const usage = child.resourceUsage();
  if (!usage) throw new Error("Subprocess.resourceUsage() is unavailable.");
  return {
    wallMs: performance.now() - started,
    cpuMs: Number(usage.cpuTime.total) / 1000,
    maxRssBytes: Number(usage.maxRSS),
  };
}
async function measure(entry: (typeof cases)[number]) {
  for (let i = 0; i < 2; i++) await run(entry);
  const samples: Awaited<ReturnType<typeof run>>[] = [];
  for (let i = 0; i < count; i++) samples.push(await run(entry));
  const quantile = (key: keyof (typeof samples)[number], p: number) =>
    samples.map((sample) => sample[key]).sort((a, b) => a - b)[Math.ceil(count * p) - 1];
  return {
    name: entry.name,
    command: entry.command,
    medianMs: quantile("wallMs", 0.5),
    p95Ms: quantile("wallMs", 0.95),
    medianCpuMs: quantile("cpuMs", 0.5),
    medianMaxRssBytes: quantile("maxRssBytes", 0.5),
    samples,
  };
}
const measurements: Awaited<ReturnType<typeof measure>>[] = [];
const result = {
  commit: Bun.spawnSync(["git", "rev-parse", "HEAD"]).stdout.toString().trim(),
  workingTree: Bun.spawnSync(["git", "status", "--short"]).stdout.toString().trim(),
  sources: await sourceHashes(),
  timestamp: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  osRelease: release(),
  cpu: cpus()[0]?.model,
  cores: cpus().length,
  ramBytes: totalmem(),
  bun: Bun.version,
  warmup: 2,
  count,
  cases: measurements,
};
for (const entry of cases.filter(
  (entry) => selected.length === 0 || selected.includes(entry.name),
)) {
  const measurement = await measure(entry);
  measurements.push(measurement);
  await Bun.write(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...measurement, samples: undefined }));
}
