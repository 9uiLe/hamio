import { beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captureTerminal } from "../scripts/preview/capture.ts";

const binary = resolve("dist/hamio");
beforeAll(async () => {
  const build = Bun.spawn([process.execPath, "scripts/build.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [code, output, error] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`Executable build failed: ${output}${error}`);
}, 30_000);

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
      [binary, "render", "--format", "json", "--input", resolve("examples/display.json")],
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
    expect(stderr).toBe("");
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
