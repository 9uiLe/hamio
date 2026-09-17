import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildExecutable } from "../build/compiler.ts";
import { compress, sha256 } from "./artifacts.ts";
import { productionDependencies } from "./dependencies.ts";
import { inventory, releaseIdentity, repository, runtime } from "./metadata.ts";
import { run } from "./process.ts";
import { type Source, writeSource } from "./source.ts";

export async function checkRuntime(path: string, root: string): Promise<string> {
  if (Bun.version !== runtime.version || Bun.revision !== runtime.revision)
    throw new Error("Use the pinned Nix shell; review runtime inventory when updating Bun.");
  if (
    (await run([path, "--revision"], root)) !== `${runtime.version}+${runtime.revision.slice(0, 9)}`
  )
    throw new Error("Bundled runtime revision does not match the inventory.");
  return sha256(path);
}

/** One isolated dependency graph and build per candidate. Never consumes dist/hamio. */
export async function prepareRelease(input: {
  source: Source;
  workspace: string;
  runtimePath: string;
  runtimeSha256: string;
}) {
  const { source, workspace, runtimePath, runtimeSha256 } = input;
  const identity = releaseIdentity(source.version, process.platform, process.arch);
  const root = join(workspace, "source");
  const output = join(workspace, "assets");
  await writeSource(source, root);
  await run([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], root, {
    SOURCE_DATE_EPOCH: source.epoch,
  });
  const dependencies = await productionDependencies(root);
  if ((await sha256(join(root, "scripts/release/bun-notices.txt"))) !== runtime.noticesSha256)
    throw new Error("Bun notices differ from the reviewed upstream revision.");
  const binary = join(workspace, "bin", "hamio");
  await buildExecutable({ root, runtime: runtimePath, output: binary });
  if ((await run([binary, "--version"], workspace)) !== source.version)
    throw new Error("Compiled version does not match its source.");
  if ((await sha256(runtimePath)) !== runtimeSha256)
    throw new Error("Bundled runtime changed during the build.");
  await mkdir(output);
  const archive = join(output, `${identity.asset}.gz`);
  await compress(binary, archive);
  const [binaryHash, archiveHash, lockHash, flakeHash] = await Promise.all([
    sha256(binary),
    sha256(archive),
    sha256(join(root, "bun.lock")),
    sha256(join(root, "flake.lock")),
  ]);
  await Bun.write(
    join(output, `${identity.asset}.sha256`),
    `${archiveHash}  ${identity.asset}.gz\n${binaryHash}  hamio\n`,
  );
  await Bun.write(
    join(output, `${identity.asset}.spdx.json`),
    `${JSON.stringify(
      inventory({
        version: source.version,
        target: identity.target,
        commit: source.commit,
        modified: source.modified,
        created: source.created,
        sourceSha256: source.digest,
        binarySha256: binaryHash,
        archiveSha256: archiveHash,
        runtimeSha256,
        lockSha256: lockHash,
        flakeSha256: flakeHash,
        license: source.license,
        dependencies,
      }),
      null,
      2,
    )}\n`,
  );
  const notices = [
    `hamio ${source.version}\nSource: ${repository}/tree/${source.commit}\nInputs SHA256: ${source.digest}\n\n${await readFile(join(root, "LICENSE"), "utf8")}`,
    ...dependencies.map((entry) => `${entry.name}@${entry.version}\n\n${entry.notice}`),
    `Bun ${runtime.version}\nSource and rebuild instructions: https://github.com/oven-sh/bun/tree/${runtime.revision}\nUpstream notice source: https://github.com/oven-sh/bun/blob/${runtime.revision}/LICENSE.md\n\n${await readFile(join(root, "scripts/release/bun-notices.txt"), "utf8")}`,
  ];
  await Bun.write(
    join(output, `${identity.asset}.notices.txt`),
    `${notices.join("\n\n--------------------\n\n")}\n`,
  );
  if (identity.target === "darwin-arm64")
    await copyFile(join(root, "scripts/install.sh"), join(output, "install.sh"));
  return {
    ...identity,
    output,
    binary,
    binaryBytes: (await stat(binary)).size,
    archiveBytes: (await stat(archive)).size,
    binarySha256: binaryHash,
    sourceSha256: source.digest,
  };
}
