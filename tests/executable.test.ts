import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildExecutable } from "../scripts/build/compiler.ts";
import { captureTerminal } from "../scripts/terminal-capture/capture.ts";

let binary = process.env.HAMIO_TEST_BINARY ? resolve(process.env.HAMIO_TEST_BINARY) : "";
let workspace: string | undefined;
beforeAll(async () => {
  if (binary) return;
  const runtime = process.env.HAMIO_BUN_RUNTIME;
  if (!runtime) throw new Error("Use the pinned Nix development shell.");
  workspace = await mkdtemp(join(tmpdir(), "hamio-test-build-"));
  binary = join(workspace, "hamio");
  await buildExecutable({ root: process.cwd(), runtime, output: binary });
}, 30_000);
afterAll(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

test("compiled executable runs without Bun in PATH and ignores project configuration", async () => {
  // Reject Nix loader/library paths, including ones invisible to PATH-only tests.
  expect(Buffer.from(await Bun.file(binary).arrayBuffer()).includes("/nix/store/")).toBe(false);
  const directory = await mkdtemp(join(tmpdir(), "hamio-compiled-"));
  try {
    const marker = join(directory, "unexpected");
    await Bun.write(
      join(directory, "preload.ts"),
      `await Bun.write(${JSON.stringify(marker)}, 'executed'); throw new Error('preload');`,
    );
    await Bun.write(join(directory, "bunfig.toml"), 'preload = ["./preload.ts"]\n');
    await Bun.write(join(directory, ".env"), "BUN_BE_BUN=1\nBUN_OPTIONS=--preload=./preload.ts\n");
    await Bun.write(join(directory, "package.json"), '{"type":"invalid"}');
    await Bun.write(join(directory, "tsconfig.json"), "invalid");
    const child = Bun.spawn(
      [binary, "presentation", "static", "--input", resolve("examples/presentation-static.json")],
      {
        cwd: directory,
        env: { PATH: "/nonexistent", HOME: directory },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(0);
    expect(stderr).toContain("Run: Build project");
    expect(JSON.parse(stdout).status).toBe("ok");
    expect(stdout).not.toContain("dummy-preview-token");
    expect(await Bun.file(marker).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("compiled executable shares form contracts with Shell consumers", async () => {
  const child = Bun.spawn(["sh", "examples/form.sh", binary], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(JSON.parse(stdout).values).toEqual({
    environment: "local",
    project: "demo",
    approved: false,
  });
});

test("compiled runtime bundles the interactive UI and handles terminal input", async () => {
  const result = await captureTerminal({
    command: [
      binary,
      "form",
      "--definition",
      resolve("examples/form.json"),
      "--interactive",
      "always",
    ],
    cols: 80,
    rows: 24,
    holdMs: 0,
    timeoutMs: 5000,
    steps: [
      { waitFor: "確認する環境を選択", send: "\r" },
      { waitFor: "この設定で続行しますか？", send: "\r" },
      { waitFor: '"status":"ok"' },
    ],
  });
  const text = result.cast
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => JSON.parse(line)[2])
    .join("");
  expect(text).toContain('"approved":false');
  expect(text).toContain("入力完了");
});

test("compiled v2 Presentation runs without Bun or Node in PATH", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hamio-presentation-"));
  try {
    const staticInput = await Bun.file("examples/presentation-static.json").text();
    for (const [mode, input] of [
      ["static", staticInput],
      [
        "live",
        `${[
          '{"protocolVersion":2,"runId":"native","seq":0,"type":"run.started","title":"Native run"}',
          '{"protocolVersion":2,"runId":"native","seq":1,"type":"run.finished","result":{"kind":"succeeded","data":{"kind":"none"}}}',
        ].join("\n")}\n`,
      ],
    ] as const) {
      const child = Bun.spawn([binary, "presentation", mode], {
        cwd: directory,
        env: { PATH: "/nonexistent", HOME: directory, NO_COLOR: "1" },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      child.stdin.write(input);
      child.stdin.end();
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout).protocolVersion).toBe(2);
      expect(stderr).toContain(mode === "static" ? "Compile sources" : "Native run");
      expect(stderr).not.toContain("\u001b");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Shell example exercises public v2 CLI through an actual PTY", async () => {
  for (const outcome of ["succeeded", "failed"] as const) {
    const result = await captureTerminal({
      command: ["sh", "examples/presentation-live.sh", binary, outcome],
      cols: 80,
      rows: 24,
      holdMs: 0,
      timeoutMs: 5000,
      steps: [{ waitFor: `"runState":"${outcome}"` }],
    });
    const output = result.cast
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => JSON.parse(line)[2])
      .join("");
    expect(output).toContain("Compile sources");
    expect(output).toContain(outcome);
    expect(output).toContain("1/2");
  }
  const staticCue = await captureTerminal({
    command: [
      "sh",
      "examples/presentation-live.sh",
      binary,
      "succeeded",
      "--no-color",
      "--no-motion",
    ],
    cols: 40,
    rows: 24,
    env: { NO_COLOR: "1" },
    holdMs: 0,
    timeoutMs: 5000,
    steps: [{ waitFor: '"runState":"succeeded"' }],
  });
  const output = staticCue.cast
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => JSON.parse(line)[2])
    .join("");
  expect(output).toContain("> running");
  expect(output).not.toContain("\u001b[32m");
  expect(output).not.toContain("\u001b[36m");
});

test("native v2 records through a real PTY and reports without Bun or Node in PATH", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hamio-record-native-"));
  try {
    const recording = join(directory, "run.ndjson");
    const report = join(directory, "report.html");
    const captured = await captureTerminal({
      command: ["sh", "examples/presentation-live.sh", binary, "succeeded", "--record", recording],
      cols: 80,
      rows: 24,
      holdMs: 0,
      timeoutMs: 5000,
      steps: [{ waitFor: '"runState":"succeeded"' }],
    });
    const terminal = captured.cast
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => JSON.parse(line)[2])
      .join("");
    expect(terminal).toContain("Compile sources");
    expect(terminal).toContain("1/2");
    const raw = await readFile(recording, "utf8");
    expect(raw).toContain('"kind":"header"');
    expect(raw).toContain('"kind":"trailer"');
    expect(raw).not.toContain("\u001b");
    const child = Bun.spawn(
      [binary, "presentation", "report", "--input", recording, "--output", report],
      {
        cwd: directory,
        env: { PATH: "/nonexistent", HOME: directory },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      },
    );
    const [exit, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(exit).toBe(0);
    expect(JSON.parse(stdout).recording.status).toBe("complete");
    const html = await readFile(report, "utf8");
    expect(html).toContain("Recording complete");
    expect(html).toContain("Artifacts are ready.");
    expect(html).not.toContain("<script");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
