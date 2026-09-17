import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { inventory, productionDependencies, releaseIdentity } from "../scripts/release/metadata.ts";

const installer = resolve("scripts/install.sh");
const commit = "1234567890abcdef1234567890abcdef12345678";
const target = releaseIdentity("0.1.0", process.platform, process.arch).target;
const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

// This double checks policy arguments and failure handling, not GitHub cryptography.
// The release workflow separately verifies the real published assets on each native runner.
const ghDouble = String.raw`#!/bin/sh
set -eu
case "$*" in *--help*) exit 0 ;; esac
printf '%s\n' "$*" >> "$TEST_LOG"
[ "$GH_HOST" = github.com ]
case "$1 $2" in
  'release verify') [ "$TEST_FAIL" != immutable ]; exit ;;
  'api repos/'*) printf '%s\n' "$TEST_COMMIT"; exit ;;
  'release download')
    shift 3
    patterns=''
    directory=''
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --repo) [ "$2" = 9uiLe/hamio ] ;;
        --pattern) patterns="$patterns $2" ;;
        --dir) directory=$2 ;;
        *) exit 91 ;;
      esac
      shift 2
    done
    for pattern in $patterns; do cp "$TEST_ASSETS/$pattern" "$directory/"; done
    exit ;;
  'release verify-asset') [ "$TEST_FAIL" != release-asset ]; exit ;;
  'attestation verify')
    [ "$TEST_FAIL" != attestation ] || exit 90
    [ -f "$3" ]
    shift 3
    [ "$#" = 9 ]
    [ "$1" = --repo ] && [ "$2" = 9uiLe/hamio ]
    [ "$3" = --signer-workflow ] && [ "$4" = 9uiLe/hamio/.github/workflows/release.yml ]
    [ "$5" = --source-ref ] && [ "$6" = "refs/tags/$TEST_TAG" ]
    [ "$7" = --source-digest ] && [ "$8" = "$TEST_COMMIT" ]
    [ "$9" = --deny-self-hosted-runners ]
    exit ;;
  *) exit 92 ;;
esac
`;

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hamio-consumer-"));
  const bin = join(directory, "tools");
  const assets = join(directory, "assets");
  const prefix = join(directory, "project tools");
  const marker = join(directory, "executed");
  const log = join(directory, "calls");
  await mkdir(bin);
  await mkdir(assets);
  await writeFile(join(bin, "gh"), ghDouble, { mode: 0o755 });
  await writeFile(log, "");
  async function release(version: string, fault = "") {
    const asset = `hamio-v${version}-${target}`;
    const program = Buffer.from(
      `#!/bin/sh\nprintf '%s\\n' invoked >> "$TEST_MARKER"\nprintf '%s\\n' '${fault === "version" ? "9.9.9" : version}'\n`,
    );
    const archive = fault === "gzip" ? Buffer.from("invalid gzip") : gzipSync(program);
    await writeFile(join(assets, `${asset}.gz`), archive);
    await writeFile(
      join(assets, `${asset}.sha256`),
      `${fault === "compressed" ? "0".repeat(64) : hash(archive)}  ${asset}.gz\n${fault === "unpacked" ? "0".repeat(64) : hash(program)}  hamio\n`,
    );
    await writeFile(join(assets, `${asset}.spdx.json`), "{}");
    await writeFile(join(assets, `${asset}.notices.txt`), "test notice");
  }
  async function install(version: string, failure = "", usePin = false) {
    if (usePin) await writeFile(join(directory, ".hamio-version"), `${version}\n`);
    const args = ["/bin/sh", installer, "--prefix", prefix];
    if (!usePin) args.push("--version", version);
    const child = Bun.spawn(args, {
      cwd: directory,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: directory,
        TEST_LOG: log,
        TEST_ASSETS: assets,
        TEST_COMMIT: commit,
        TEST_TAG: version,
        TEST_FAIL: failure,
        TEST_MARKER: marker,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, stdout, stderr };
  }
  return {
    directory,
    bin,
    assets,
    prefix,
    marker,
    log,
    release,
    install,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test("consumer pins, installs, updates and rolls back without a runtime or launcher", async () => {
  const f = await fixture();
  try {
    await f.release("0.1.0");
    await f.release("0.2.0");
    expect(await f.install("v0.1.0", "", true)).toMatchObject({ code: 0 });
    const first = await readlink(join(f.prefix, "bin/hamio"));
    expect(first).toBe(`../lib/hamio/v0.1.0-${target}/hamio`);
    expect(await f.install("v0.2.0")).toMatchObject({ code: 0 });
    expect(await readlink(join(f.prefix, "bin/hamio"))).toContain("v0.2.0");
    expect(await f.install("v0.1.0")).toMatchObject({ code: 0 });
    expect(await f.install("v0.1.0")).toMatchObject({ code: 0 });
    expect(await readlink(join(f.prefix, "bin/hamio"))).toBe(first);
    expect(await readFile(join(f.prefix, `lib/hamio/v0.1.0-${target}/source-commit`), "utf8")).toBe(
      `${commit}\n`,
    );
    const calls = await readFile(f.log, "utf8");
    expect(calls.match(/attestation verify/g)).toHaveLength(16);
    expect(calls.indexOf("release verify v0.1.0")).toBeLessThan(calls.indexOf("release download"));
  } finally {
    await f.cleanup();
  }
});

for (const failure of [
  "immutable",
  "release-asset",
  "attestation",
  "compressed",
  "unpacked",
  "gzip",
  "version",
]) {
  test(`installation rejects ${failure} failure and preserves the active version`, async () => {
    const f = await fixture();
    try {
      await f.release("0.1.0");
      expect((await f.install("v0.1.0")).code).toBe(0);
      await rm(f.marker);
      await f.release("0.2.0", failure);
      expect((await f.install("v0.2.0", failure)).code).not.toBe(0);
      expect(await readlink(join(f.prefix, "bin/hamio"))).toContain("v0.1.0");
      expect(await Bun.file(f.marker).exists()).toBe(failure === "version");
      // A failed installer releases its lock, so the next verified update can proceed.
      await f.release("0.2.0");
      expect((await f.install("v0.2.0")).code).toBe(0);
    } finally {
      await f.cleanup();
    }
  });
}

test("version input cannot select latest, paths, shell code or additional lines", async () => {
  const f = await fixture();
  try {
    for (const version of [
      "latest",
      "v01.2.3",
      "../v1.2.3",
      "v1.2.3\ninvalid",
      "v1.2.3\nv2.0.0",
      "$(touch nope)",
    ]) {
      expect((await f.install(version)).code).not.toBe(0);
    }
    expect(await readFile(f.log, "utf8")).toBe("");
  } finally {
    await f.cleanup();
  }
});

test("installer refuses unmanaged executables, concurrent installs and unsupported platforms", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.prefix, "bin"), { recursive: true });
    const destination = join(f.prefix, "bin/hamio");
    await writeFile(destination, "owned by consumer");
    expect((await f.install("v0.1.0")).stderr).toContain("unmanaged");
    expect(await readFile(destination, "utf8")).toBe("owned by consumer");
    await rm(destination);
    await mkdir(join(f.prefix, ".hamio-install.lock"));
    expect((await f.install("v0.1.0")).stderr).toContain("Another installation");
    await rm(join(f.prefix, ".hamio-install.lock"), { recursive: true });
    await writeFile(join(f.bin, "uname"), "#!/bin/sh\nprintf '%s\\n' unsupported\n");
    await chmod(join(f.bin, "uname"), 0o755);
    expect((await f.install("v0.1.0")).stderr).toContain("Supported platforms");
    expect(await readFile(f.log, "utf8")).toBe("");
  } finally {
    await f.cleanup();
  }
});

test("inventory includes installed production dependencies and states the runtime boundary", async () => {
  const dependencies = await productionDependencies(process.cwd());
  expect(dependencies.map(({ name }) => name)).toEqual([
    "@clack/core",
    "fast-string-truncated-width",
    "fast-string-width",
    "fast-wrap-ansi",
    "sisteransi",
  ]);
  expect(dependencies.every(({ notice }) => notice.includes("Permission"))).toBe(true);
  const result = inventory({
    version: "0.1.0",
    target,
    commit,
    modified: false,
    created: "2026-09-17T00:00:00Z",
    license: "NOASSERTION",
    binarySha256: "1".repeat(64),
    archiveSha256: "5".repeat(64),
    runtimeSha256: "2".repeat(64),
    lockSha256: "3".repeat(64),
    flakeSha256: "4".repeat(64),
    dependencies,
  });
  expect(result.packages).toHaveLength(7);
  const product = result.packages.find((entry) => entry.SPDXID === "SPDXRef-hamio");
  if (!product || !("checksums" in product)) throw new Error("Product checksum is missing.");
  expect(product.checksums[0]?.checksumValue).toBe("5".repeat(64));
  expect(result.comment).toContain("Not a complete component-level inventory");
  expect(result.packages[1]?.licenseDeclared).toBe("NOASSERTION");
  expect(() => releaseIdentity("0.1.0", "darwin", "x64")).toThrow("Unsupported");
  expect(() => releaseIdentity("01.0.0", "linux", "x64")).toThrow("exact");
});
