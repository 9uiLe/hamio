import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import pkg from "../../package.json";
import {
  inventory,
  productionDependencies,
  releaseIdentity,
  repository,
  runtime,
  sha256,
} from "./metadata.ts";

const identity = releaseIdentity(pkg.version, process.platform, process.arch);
const runtimePath = process.env.HAMIO_BUN_RUNTIME;
if (!runtimePath || Bun.version !== runtime.version || Bun.revision !== runtime.revision) {
  throw new Error("Use the pinned Nix shell; review runtime inventory when updating Bun.");
}
const runtimeVersion = Bun.spawnSync([runtimePath, "--revision"]);
if (
  runtimeVersion.exitCode !== 0 ||
  runtimeVersion.stdout.toString().trim() !== `${runtime.version}+${runtime.revision.slice(0, 9)}`
) {
  throw new Error("Bundled runtime revision does not match the inventory.");
}
if ((await sha256("scripts/release/bun-notices.txt")) !== runtime.noticesSha256) {
  throw new Error("Bun notices differ from the reviewed upstream revision.");
}
const binary = resolve("dist/hamio");
const env = { ...process.env };
delete env.BUN_OPTIONS;
delete env.BUN_BE_BUN;
const version = Bun.spawnSync([binary, "--version"], { env });
if (version.exitCode !== 0 || version.stdout.toString().trim() !== pkg.version) {
  throw new Error("Build dist/hamio from the current package version first.");
}
const git = Bun.spawnSync(["git", "rev-parse", "HEAD"]);
const commit = git.stdout.toString().trim();
if (git.exitCode !== 0 || !/^[0-9a-f]{40}$/.test(commit))
  throw new Error("Cannot resolve source commit.");
const status = Bun.spawnSync(["git", "status", "--porcelain"]);
if (status.exitCode !== 0) throw new Error("Cannot resolve worktree status.");
const modified = status.stdout.length > 0;
const appLicense = (await Bun.file("LICENSE").exists())
  ? await readFile("LICENSE", "utf8")
  : "No license granted. Publication requires an owner-selected LICENSE.";
const license = "license" in pkg && typeof pkg.license === "string" ? pkg.license : "NOASSERTION";
const dependencies = await productionDependencies(process.cwd());
const output = "dist/release";
await mkdir(output, { recursive: true });
const archive = `${output}/${identity.asset}.gz`;
await pipeline(createReadStream(binary), createGzip({ level: 9 }), createWriteStream(archive));
const [binaryHash, archiveHash, runtimeHash, lockHash, flakeHash] = await Promise.all([
  sha256(binary),
  sha256(archive),
  sha256(runtimePath),
  sha256("bun.lock"),
  sha256("flake.lock"),
]);
await Bun.write(
  `${output}/${identity.asset}.sha256`,
  `${archiveHash}  ${identity.asset}.gz\n${binaryHash}  hamio\n`,
);
await Bun.write(
  `${output}/${identity.asset}.spdx.json`,
  `${JSON.stringify(
    inventory({
      version: pkg.version,
      target: identity.target,
      commit,
      modified,
      created: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      binarySha256: binaryHash,
      archiveSha256: archiveHash,
      runtimeSha256: runtimeHash,
      lockSha256: lockHash,
      flakeSha256: flakeHash,
      license,
      dependencies,
    }),
    null,
    2,
  )}\n`,
);
const notices = [
  `hamio ${pkg.version}\nSource: ${repository}/tree/${commit}\n\n${appLicense}`,
  ...dependencies.map((entry) => `${entry.name}@${entry.version}\n\n${entry.notice}`),
  `Bun ${runtime.version}\nSource and rebuild instructions: https://github.com/oven-sh/bun/tree/${runtime.revision}\nUpstream notice source: https://github.com/oven-sh/bun/blob/${runtime.revision}/LICENSE.md\n\n${await readFile("scripts/release/bun-notices.txt", "utf8")}`,
];
await Bun.write(
  `${output}/${identity.asset}.notices.txt`,
  `${notices.join("\n\n--------------------\n\n")}\n`,
);
if (identity.target === "darwin-arm64")
  await copyFile("scripts/install.sh", `${output}/install.sh`);
const [raw, packed] = await Promise.all([stat(binary), stat(archive)]);
console.log(
  JSON.stringify({
    ...identity,
    binaryBytes: raw.size,
    archiveBytes: packed.size,
    dependencies: dependencies.length,
  }),
);
