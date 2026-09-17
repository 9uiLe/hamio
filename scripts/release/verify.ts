import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { assetHashes, publishAssets, sha256 } from "./artifacts.ts";
import { checkRuntime, prepareRelease } from "./pipeline.ts";
import { run } from "./process.ts";
import { assertSourceUnchanged, captureSource } from "./source.ts";

const root = process.cwd();
const runtimePath = process.env.HAMIO_BUN_RUNTIME;
if (!runtimePath) throw new Error("Use the pinned Nix shell to verify releases.");
const source = await captureSource(root);
const runtimeSha256 = await checkRuntime(runtimePath, root);
await mkdir("dist", { recursive: true });
const workspace = await mkdtemp(resolve("dist/.hamio-verify-"));
try {
  const first = await prepareRelease({
    source,
    workspace: join(workspace, "first"),
    runtimePath,
    runtimeSha256,
  });
  const second = await prepareRelease({
    source,
    workspace: join(workspace, "different-path", "second"),
    runtimePath,
    runtimeSha256,
  });
  const hashes = await assetHashes(first.output);
  if (JSON.stringify(hashes) !== JSON.stringify(await assetHashes(second.output)))
    throw new Error("Release assets differ between independent builds.");
  const binary = join(workspace, "installed-hamio");
  await pipeline(
    createReadStream(join(first.output, `${first.asset}.gz`)),
    createGunzip(),
    createWriteStream(binary),
  );
  if ((await sha256(binary)) !== first.binarySha256)
    throw new Error("Compressed executable differs from its build.");
  await chmod(binary, 0o755);
  const tests = await run(
    [process.execPath, "test", "tests/api.test.ts", "tests/executable.test.ts"],
    root,
    { HAMIO_TEST_BINARY: binary },
  );
  await assertSourceUnchanged(root, source);
  await publishAssets(first.output, resolve("dist/release"));
  const report = {
    sourceCommit: source.commit,
    sourceSha256: source.digest,
    target: first.target,
    runtimeSha256,
    independentBuilds: 2,
    assets: hashes,
    executableTests: "api.test.ts + executable.test.ts",
    binaryBytes: first.binaryBytes,
    archiveBytes: first.archiveBytes,
  };
  await Bun.write("dist/release-verification.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(tests);
  console.log(JSON.stringify(report));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
