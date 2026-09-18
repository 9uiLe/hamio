import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const updater = resolve("scripts/update-nix-release.ts");
const commit = "1234567890abcdef1234567890abcdef12345678";
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
// Policy/atomicity double only. Actual cryptography is checked when generating the committed pin.
const ghDouble = String.raw`#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$TEST_LOG"
[ "$GH_HOST" = github.com ] && [ "$GH_REPO" = 9uiLe/hamio ]
case "$1 $2" in
  'release verify') [ "$TEST_FAIL" != release ]; exit ;;
  'api repos/'*)
    if [ "$TEST_FAIL" = commit ]; then printf 'invalid\n'; else printf '%s\n' "$TEST_COMMIT"; fi
    exit ;;
  'release download')
    shift 3
    while [ "$#" -gt 0 ]; do
      [ "$1" = --pattern ]
      cp "$TEST_ASSETS/$2" .
      shift 2
    done
    exit ;;
  'release verify-asset') [ "$TEST_FAIL" != asset ]; exit ;;
  'attestation verify')
    [ "$TEST_FAIL" != attestation ] || exit 1
    case "$TEST_FAIL:$3" in late:*linux-x64*) exit 1 ;; esac
    [ -f "$3" ]
    shift 3
    [ "$#" = 9 ]
    [ "$1" = --repo ] && [ "$2" = 9uiLe/hamio ]
    [ "$3" = --signer-workflow ] && [ "$4" = 9uiLe/hamio/.github/workflows/release.yml ]
    [ "$5" = --source-ref ] && [ "$6" = refs/tags/v0.1.0 ]
    [ "$7" = --source-digest ] && [ "$8" = "$TEST_COMMIT" ]
    [ "$9" = --deny-self-hosted-runners ]
    exit ;;
  *) exit 92 ;;
esac
`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "hamio-nix-pin-"));
  const tools = join(root, "tools");
  const assets = join(root, "assets");
  const destination = join(root, "release.json");
  const log = join(root, "calls");
  const marker = join(root, "executed");
  await mkdir(tools);
  await mkdir(assets);
  await writeFile(join(tools, "gh"), ghDouble, { mode: 0o755 });
  await writeFile(destination, "original pin\n");
  await writeFile(log, "");
  const program = `#!/bin/sh\ntouch '${marker}'\n`;
  const archive = gzipSync(program);
  for (const target of ["darwin-arm64", "linux-arm64", "linux-x64"]) {
    const name = `hamio-v0.1.0-${target}`;
    await writeFile(join(assets, `${name}.gz`), archive);
    await writeFile(
      join(assets, `${name}.sha256`),
      `${hash(archive)}  ${name}.gz\n${hash(program)}  hamio\n`,
    );
    await writeFile(join(assets, `${name}.spdx.json`), "{}");
    await writeFile(join(assets, `${name}.notices.txt`), "Test notice");
  }
  const runner = join(root, "run.ts");
  await writeFile(
    runner,
    `import { updateNixRelease } from ${JSON.stringify(updater)};\nawait updateNixRelease(process.argv[2], ${JSON.stringify(destination)});\n`,
  );
  async function update(failure = "", tag = "v0.1.0") {
    const child = Bun.spawn([process.execPath, runner, tag], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${tools}:/usr/bin:/bin`,
        TEST_LOG: log,
        TEST_ASSETS: assets,
        TEST_COMMIT: commit,
        TEST_FAIL: failure,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    return { code, stderr };
  }
  return {
    root,
    assets,
    destination,
    log,
    marker,
    program,
    archive,
    update,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("Nix release pins all verified assets without executing downloaded code", async () => {
  const f = await fixture();
  try {
    expect(await f.update()).toMatchObject({ code: 0 });
    const manifest: unknown = JSON.parse(await readFile(f.destination, "utf8"));
    expect(manifest).toMatchObject({
      version: "0.1.0",
      sourceCommit: commit,
      sources: {
        "aarch64-darwin": {
          target: "darwin-arm64",
          archive: hash(f.archive),
          binary: hash(f.program),
        },
        "aarch64-linux": { target: "linux-arm64", sbom: hash("{}") },
        "x86_64-linux": { target: "linux-x64", notices: hash("Test notice") },
      },
    });
    expect((await readFile(f.log, "utf8")).match(/attestation verify/g)).toHaveLength(12);
    expect(await Bun.file(f.marker).exists()).toBe(false);
  } finally {
    await f.cleanup();
  }
});

for (const failure of ["release", "commit", "asset", "attestation", "late", "checksum"]) {
  test(`Nix release update preserves the pin on ${failure} failure and permits retry`, async () => {
    const f = await fixture();
    try {
      const checksum = join(f.assets, "hamio-v0.1.0-linux-x64.sha256");
      const original = await readFile(checksum);
      if (failure === "checksum") await writeFile(checksum, "invalid checksum\n");
      expect((await f.update(failure)).code).not.toBe(0);
      expect(await readFile(f.destination, "utf8")).toBe("original pin\n");
      expect(await Bun.file(f.marker).exists()).toBe(false);
      await writeFile(checksum, original);
      expect((await f.update()).code).toBe(0);
    } finally {
      await f.cleanup();
    }
  });
}

test("Nix release update rejects non-exact tags and a competing update before network access", async () => {
  const f = await fixture();
  try {
    for (const tag of ["latest", "v01.2.3", "../v0.1.0", "v0.1.0-rc.1", "v0.1.0\nother"]) {
      expect((await f.update("", tag)).code).not.toBe(0);
    }
    await mkdir(`${f.destination}.lock`);
    expect((await f.update()).code).not.toBe(0);
    expect(await readFile(f.log, "utf8")).toBe("");
    expect(await readFile(f.destination, "utf8")).toBe("original pin\n");
  } finally {
    await f.cleanup();
  }
});
