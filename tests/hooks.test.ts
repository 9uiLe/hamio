import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const fixtures: string[] = [];
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  HAMIO_DEV_SHELL: "1",
  HUSKY: "1",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

function run(cwd: string, command: string[]) {
  const [executable, ...args] = command;
  if (!executable) throw new Error("Command is required");
  const result = spawnSync(executable, args, {
    cwd,
    env: { ...env, XDG_CONFIG_HOME: join(cwd, ".test-config") },
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  return result;
}

function must(cwd: string, command: string[]) {
  const result = run(cwd, command);
  if (result.status !== 0)
    throw new Error(`${command.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "hamio-hooks-"));
  fixtures.push(cwd);
  for (const name of [
    ".gitignore",
    ".lintstagedrc.json",
    ".prettierrc.json",
    "biome.json",
    "scripts/dev.sh",
    "scripts/install-hooks.ts",
    ".husky/pre-commit",
    ".husky/pre-push",
  ]) {
    mkdirSync(dirname(join(cwd, name)), { recursive: true });
    copyFileSync(join(root, name), join(cwd, name));
  }
  symlinkSync(join(root, "node_modules"), join(cwd, "node_modules"), "dir");
  writeFileSync(
    join(cwd, "package.json"),
    `${JSON.stringify({ private: true, type: "module", scripts: { "check:staged": "lint-staged --concurrent 2", check: "tsc --noEmit" } }, null, 2)}\n`,
  );
  writeFileSync(
    join(cwd, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], skipLibCheck: true }, include: ["sample.ts"] }, null, 2)}\n`,
  );
  writeFileSync(join(cwd, "sample.ts"), "export const answer: number = 1;\n");
  must(cwd, ["git", "init", "--initial-branch=main"]);
  must(cwd, ["git", "config", "user.name", "Hook test"]);
  must(cwd, ["git", "config", "user.email", "hook-test@example.invalid"]);
  // Establish the fixture before enabling hooks; no application files are changed.
  must(cwd, ["git", "add", "."]);
  must(cwd, ["git", "-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"]);
  must(cwd, ["bun", "scripts/install-hooks.ts"]);
  return cwd;
}

afterEach(() => {
  for (const cwd of fixtures.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

describe("local quality hooks", () => {
  test("rejects staged formatting errors even if the working copy is fixed", () => {
    const cwd = fixture();
    const staged = "export const answer:number=2\n";
    const working = "export const answer: number = 2;\n";
    writeFileSync(join(cwd, "sample.ts"), staged);
    must(cwd, ["git", "add", "sample.ts"]);
    writeFileSync(join(cwd, "sample.ts"), working);
    const before = must(cwd, ["git", "rev-parse", "HEAD"]);
    expect(run(cwd, ["git", "commit", "-m", "reject formatting"]).status).not.toBe(0);
    expect(must(cwd, ["git", "rev-parse", "HEAD"])).toBe(before);
    expect(must(cwd, ["git", "show", ":sample.ts"])).toBe(staged);
    expect(readFileSync(join(cwd, "sample.ts"), "utf8")).toBe(working);
  }, 30_000);

  test("rejects a lint violation and accepts a corrected commit", () => {
    const cwd = fixture();
    writeFileSync(join(cwd, "sample.ts"), "export const answer: any = 2;\n");
    must(cwd, ["git", "add", "sample.ts"]);
    expect(run(cwd, ["git", "commit", "-m", "reject any"]).status).not.toBe(0);
    writeFileSync(join(cwd, "sample.ts"), "export const answer: number = 2;\n");
    must(cwd, ["git", "add", "sample.ts"]);
    must(cwd, ["git", "commit", "-m", "valid change"]);
  }, 30_000);

  test("pre-push rejects a type error before updating a local remote", () => {
    const cwd = fixture();
    const remote = join(cwd, "remote.git");
    must(cwd, ["git", "init", "--bare", remote]);
    must(cwd, ["git", "remote", "add", "origin", remote]);
    writeFileSync(join(cwd, "sample.ts"), 'export const answer: number = "wrong";\n');
    must(cwd, ["git", "add", "sample.ts"]);
    must(cwd, ["git", "commit", "-m", "type error fixture"]);
    expect(run(cwd, ["git", "push", "origin", "HEAD:main"]).status).not.toBe(0);
    expect(
      run(cwd, ["git", "--git-dir", remote, "rev-parse", "--verify", "refs/heads/main"]).status,
    ).not.toBe(0);
    writeFileSync(join(cwd, "sample.ts"), "export const answer: number = 3;\n");
    must(cwd, ["git", "add", "sample.ts"]);
    must(cwd, ["git", "commit", "-m", "correct type"]);
    must(cwd, ["git", "push", "origin", "HEAD:main"]);
  }, 30_000);

  test("pre-push isolates nested repositories from the invoking Git environment", () => {
    const cwd = fixture();
    const before = must(cwd, ["git", "rev-parse", "HEAD"]);
    const index = must(cwd, ["git", "write-tree"]);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ private: true, scripts: { check: "sh check-repositories.sh" } }),
    );
    writeFileSync(
      join(cwd, "check-repositories.sh"),
      [
        "set -eu",
        "mkdir nested",
        "cd nested",
        "git init -q",
        "git -c user.name=Fixture -c user.email=fixture@example.invalid commit --allow-empty -qm nested",
        "git init --bare -q ../nested-remote.git",
      ].join("\n"),
    );
    const result = spawnSync("sh", [".husky/pre-push"], {
      cwd,
      env: {
        ...env,
        GIT_DIR: join(cwd, ".git"),
        GIT_WORK_TREE: cwd,
        GIT_INDEX_FILE: join(cwd, ".git/index"),
        GIT_COMMON_DIR: join(cwd, ".git"),
      },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(must(cwd, ["git", "rev-parse", "HEAD"])).toBe(before);
    expect(must(cwd, ["git", "write-tree"])).toBe(index);
    expect(must(cwd, ["git", "config", "--get", "core.bare"]).trim()).toBe("false");
    expect(must(join(cwd, "nested"), ["git", "log", "-1", "--format=%s"]).trim()).toBe("nested");
    expect(
      must(join(cwd, "nested-remote.git"), ["git", "rev-parse", "--is-bare-repository"]).trim(),
    ).toBe("true");
  }, 30_000);

  test("hook installation preserves an existing hooks directory", () => {
    const cwd = fixture();
    must(cwd, ["git", "config", "core.hooksPath", "custom-hooks"]);
    expect(run(cwd, ["bun", "scripts/install-hooks.ts"]).status).not.toBe(0);
    expect(must(cwd, ["git", "config", "--get", "core.hooksPath"]).trim()).toBe("custom-hooks");
  }, 30_000);
});
