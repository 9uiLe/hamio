import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildExecutable } from "../scripts/build/compiler.ts";
import { publishAssets, sha256 } from "../scripts/release/artifacts.ts";
import { run } from "../scripts/release/process.ts";
import { releaseMode } from "../scripts/release/policy.ts";
import { assertSourceUnchanged, captureSource, writeSource } from "../scripts/release/source.ts";

async function temporary(action: (path: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "hamio-release-test-"));
  try {
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("builds from independent roots are byte-identical and ignore an existing dist executable", async () => {
  const runtime = process.env.HAMIO_BUN_RUNTIME;
  if (!runtime) throw new Error("Use the pinned Nix development shell.");
  await temporary(async (directory) => {
    const source = await captureSource(process.cwd());
    const outputs: string[] = [];
    for (const name of ["first", "different/second"]) {
      const root = join(directory, name);
      await writeSource(source, root);
      await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
      await mkdir(join(root, "dist"));
      await writeFile(join(root, "dist/hamio"), "stale build from another source");
      const output = join(root, "fresh", "hamio");
      await buildExecutable({ root, runtime, output });
      expect(await run([output, "--version"], directory)).toBe(source.version);
      expect(await readFile(join(root, "dist/hamio"), "utf8")).toBe(
        "stale build from another source",
      );
      outputs.push(await sha256(output));
    }
    expect(outputs[0]).toBe(outputs[1]);
  });
}, 30_000);

test("release source identity uses commit time and detects edits and symlink inputs", async () => {
  await temporary(async (root) => {
    await writeSource(await captureSource(process.cwd()), root);
    await run(["git", "init", "-q"], root);
    await run(["git", "add", "."], root);
    await run(
      [
        "git",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      root,
      {
        GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
      },
    );
    const source = await captureSource(root);
    expect(source.created).toBe("2020-01-01T00:00:00Z");
    expect(source.modified).toBe(false);
    await assertSourceUnchanged(root, source);
    await writeFile(join(root, "src/cli.ts"), 'throw new Error("changed");\n');
    await expect(assertSourceUnchanged(root, source)).rejects.toThrow("Source changed");
    expect((await captureSource(root)).digest).not.toBe(source.digest);
    await symlink(join(root, "LICENSE"), join(root, "src/external.ts"));
    await expect(captureSource(root)).rejects.toThrow("symlinks");
  });
});

test("asset publication replaces a complete set, rejects competing writes and restores on failure", async () => {
  await temporary(async (directory) => {
    const output = join(directory, "release");
    const staged = join(directory, "staged");
    await mkdir(output);
    await mkdir(staged);
    await writeFile(join(output, "old.gz"), "old");
    await writeFile(join(staged, "new.gz"), "new");
    await mkdir(`${output}.lock`);
    await expect(publishAssets(staged, output)).rejects.toThrow();
    expect(await readFile(join(output, "old.gz"), "utf8")).toBe("old");
    await rm(`${output}.lock`, { recursive: true });
    await expect(publishAssets(join(directory, "missing"), output)).rejects.toThrow();
    expect(await readFile(join(output, "old.gz"), "utf8")).toBe("old");
    await publishAssets(staged, output);
    expect(await readdir(output)).toEqual(["new.gz"]);
    expect(await readdir(directory)).toEqual(["release"]);
  });
});

test("publication policy rejects forks, mismatched tags, branches and implicit publication", () => {
  expect(releaseMode("verify", "9uiLe/hamio", "refs/heads/candidate", "v0.1.0")).toBe("verify");
  expect(releaseMode("verify", "9uiLe/hamio", "refs/tags/v0.1.0", "v0.1.0")).toBe("verify");
  expect(releaseMode("publish", "9uiLe/hamio", "refs/tags/v0.1.0", "v0.1.0")).toBe("publish");
  for (const [mode, repository, ref] of [
    [undefined, "9uiLe/hamio", "refs/tags/v0.1.0"],
    ["publish", "fork/hamio", "refs/tags/v0.1.0"],
    ["publish", "9uiLe/hamio", "refs/heads/master"],
    ["publish", "9uiLe/hamio", "refs/tags/v0.2.0"],
    ["verify", "9uiLe/hamio", "refs/pull/1/merge"],
    ["verify", "9uiLe/hamio", "refs/tags/v0.2.0"],
  ])
    expect(() => releaseMode(mode, repository, ref, "v0.1.0")).toThrow();
});
