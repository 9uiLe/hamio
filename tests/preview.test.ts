import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkPreviews,
  imageHashes,
  imageNames,
  manifestPath,
  previewDirectory,
  previewChanges,
  recordingChanges,
  recordingHashes,
  recordingManifestPath,
  recordingNames,
  sourceHashes,
} from "../scripts/preview/artifacts.ts";
import { captureTerminal } from "../scripts/preview/capture.ts";

const command = (source: string) => [
  process.execPath,
  "--no-env-file",
  "--no-install",
  "-e",
  source,
];
const geometry = { cols: 80, rows: 20, holdMs: 0, timeoutMs: 2000 };

test("preview records a real terminal and drives input without inheriting credentials", async () => {
  const previous = process.env.HAMIO_PREVIEW_TEST_SECRET;
  process.env.HAMIO_PREVIEW_TEST_SECRET = "do-not-record";
  try {
    const result = await captureTerminal({
      ...geometry,
      command: command(`
        if (!process.stdin.isTTY || !process.stderr.isTTY) process.exit(2);
        if (process.env.HAMIO_PREVIEW_TEST_SECRET) process.exit(3);
        process.stdin.setRawMode(true);
        process.stdin.on('data', () => {
          process.stderr.write('\\r\\x1b[2K回答完了');
          process.exit(0);
        });
        process.stderr.write('入力待ち');
      `),
      steps: [{ waitFor: "入力待ち", snapshot: "input", send: "\r" }, { waitFor: "回答完了" }],
    });
    expect(result.cast).toContain("回答完了");
    const frame = result.snapshots.get("input");
    if (frame === undefined) throw new Error("Missing input frame.");
    const snapshot = result.cast
      .split("\n")
      .slice(0, frame + 2)
      .join("\n");
    expect(snapshot).toContain("入力待ち");
    expect(snapshot).not.toContain("回答完了");
    expect(result.cast).not.toContain("do-not-record");
  } finally {
    if (previous === undefined) delete process.env.HAMIO_PREVIEW_TEST_SECRET;
    else process.env.HAMIO_PREVIEW_TEST_SECRET = previous;
  }
});

test("preview freshness detects source additions, changed sources, and altered PNGs", async () => {
  const root = await mkdtemp(join(tmpdir(), "hamio-preview-hashes-"));
  const directory = join(root, previewDirectory);
  try {
    await mkdir(directory, { recursive: true });
    await Bun.write(join(root, "package.json"), "{}");
    for (const name of imageNames) {
      await Bun.write(join(directory, name), Bun.file(join(previewDirectory, name)));
    }
    const manifest = {
      schemaVersion: 1,
      sources: await sourceHashes(root),
      images: await imageHashes(directory),
    };
    await Bun.write(join(root, manifestPath), JSON.stringify(manifest));
    await checkPreviews(root);
    await Bun.write(join(root, "src/new.ts"), "export {};\n");
    await expect(checkPreviews(root)).rejects.toThrow("stale");
    expect(await previewChanges(root)).toEqual(["src/new.ts"]);
    await rm(join(root, "src"), { recursive: true });
    await Bun.write(join(root, "package.json"), '{"changed": true}');
    await expect(checkPreviews(root)).rejects.toThrow("stale");
    await Bun.write(join(root, "package.json"), "{}");
    const name = imageNames[0];
    if (!name) throw new Error("Expected a preview image.");
    const image = await Bun.file(join(directory, name)).bytes();
    await Bun.write(join(directory, name), Buffer.concat([image, Buffer.from("modified")]));
    await expect(checkPreviews(root)).rejects.toThrow("stale");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preview reuses verified images without renderer tools and leaves them unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "hamio-preview-reuse-"));
  try {
    for (const name of imageNames) {
      await Bun.write(join(root, previewDirectory, name), Bun.file(join(previewDirectory, name)));
    }
    const sources = await sourceHashes(root);
    const images = await imageHashes(join(root, previewDirectory));
    const manifest = JSON.stringify({ schemaVersion: 1, sources, images });
    await Bun.write(join(root, manifestPath), manifest);
    const before = Bun.file(join(root, manifestPath)).lastModified;
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../scripts/preview/generate.ts")],
      {
        cwd: root,
        env: { PATH: "", HOME: root },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [code, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(output).toContain("reused verified files");
    expect(await Bun.file(join(root, manifestPath)).text()).toBe(manifest);
    expect(Bun.file(join(root, manifestPath)).lastModified).toBe(before);
    expect(await imageHashes(join(root, previewDirectory))).toEqual(images);
    await Bun.write(join(root, manifestPath), "{");
    await expect(checkPreviews(root)).rejects.toThrow("stale");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recording reuse requires matching sources and intact local files", async () => {
  const root = await mkdtemp(join(tmpdir(), "hamio-preview-recording-"));
  try {
    expect((await recordingChanges(root)).length).toBeGreaterThan(0);
    await Bun.write(join(root, "package.json"), "{}");
    for (const name of recordingNames) await Bun.write(join(root, "dist/preview", name), "fixture");
    const sources = await sourceHashes(root);
    const recordings = await recordingHashes(join(root, "dist/preview"));
    await Bun.write(
      join(root, recordingManifestPath),
      JSON.stringify({ schemaVersion: 1, sources, recordings }),
    );
    expect(await recordingChanges(root)).toEqual([]);
    await Bun.write(join(root, "package.json"), '{"changed":true}');
    expect(await recordingChanges(root)).toEqual(["package.json"]);
    await Bun.write(join(root, "package.json"), "{}");
    const name = recordingNames[0];
    if (!name) throw new Error("Missing recording fixture.");
    await Bun.write(join(root, "dist/preview", name), "altered");
    expect(await recordingChanges(root)).toEqual([`dist/preview/${name}`]);
    await rm(join(root, "dist/preview", name));
    expect((await recordingChanges(root)).length).toBeGreaterThan(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preview preserves UTF-8 split across terminal chunks", async () => {
  const result = await captureTerminal({
    ...geometry,
    command: command(`
      const text = Buffer.from('日本語');
      process.stdout.write(text.subarray(0, 2));
      await Bun.sleep(20);
      process.stdout.write(text.subarray(2));
    `),
    steps: [{ waitFor: "日本語", snapshot: "result" }],
  });
  expect(result.cast).toContain("日本語");
  expect(result.cast).not.toContain("�");
});

test("preview rejects nonzero exit even after the expected screen", async () => {
  await expect(
    captureTerminal({
      ...geometry,
      command: command("process.stdout.write('done'); process.exit(7)"),
      steps: [{ waitFor: "done" }],
    }),
  ).rejects.toThrow("exit code 7");
});

test("preview rejects missing screens, unbounded output, and a stalled process", async () => {
  await expect(
    captureTerminal({
      ...geometry,
      command: command("process.stdout.write('other')"),
      steps: [{ waitFor: "done" }],
    }),
  ).rejects.toThrow("expected screen");
  await expect(
    captureTerminal({
      ...geometry,
      maxBytes: 32,
      command: command("process.stdout.write('x'.repeat(10000)); setInterval(() => {}, 1000)"),
      steps: [],
    }),
  ).rejects.toThrow("limit");
  await expect(
    captureTerminal({
      ...geometry,
      timeoutMs: 100,
      command: command("setInterval(() => {}, 1000)"),
      steps: [{ waitFor: "never" }],
    }),
  ).rejects.toThrow("timed out");
  await expect(
    captureTerminal({
      ...geometry,
      timeoutMs: 100,
      command: command("process.stdout.write('done'); setInterval(() => {}, 1000)"),
      steps: [{ waitFor: "done" }],
    }),
  ).rejects.toThrow("timed out");
});
