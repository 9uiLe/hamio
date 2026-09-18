import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sha256 } from "./release/artifacts.ts";
import { run } from "./release/process.ts";

const repository = "9uiLe/hamio";
const platforms = {
  "aarch64-darwin": "darwin-arm64",
  "aarch64-linux": "linux-arm64",
  "x86_64-linux": "linux-x64",
};

/** Verify published bytes before replacing the Nix pin. Never executes downloaded code. */
export async function updateNixRelease(tag: string, destination: string): Promise<void> {
  if (!/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag))
    throw new Error("Specify an exact published vX.Y.Z tag.");
  const file = resolve(destination);
  await mkdir(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  await mkdir(lock);
  try {
    const workspace = await mkdtemp(join(lock, "assets-"));
    const gh = (...args: string[]) =>
      run(["gh", ...args], workspace, {
        GH_HOST: "github.com",
        GH_REPO: repository,
        GH_PROMPT_DISABLED: "1",
      });
    await gh("release", "verify", tag);
    const sourceCommit = await gh("api", `repos/${repository}/commits/${tag}`, "--jq", ".sha");
    if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("Invalid release source commit.");
    const sources: Record<
      string,
      {
        target: string;
        archive: string;
        binary: string;
        checksum: string;
        sbom: string;
        notices: string;
      }
    > = {};
    for (const [system, target] of Object.entries(platforms)) {
      const asset = `hamio-${tag}-${target}`;
      const names = [
        `${asset}.gz`,
        `${asset}.sha256`,
        `${asset}.spdx.json`,
        `${asset}.notices.txt`,
      ];
      await gh("release", "download", tag, ...names.flatMap((name) => ["--pattern", name]));
      for (const name of names) {
        await gh("release", "verify-asset", tag, name);
        await gh(
          "attestation",
          "verify",
          name,
          "--repo",
          repository,
          "--signer-workflow",
          `${repository}/.github/workflows/release.yml`,
          "--source-ref",
          `refs/tags/${tag}`,
          "--source-digest",
          sourceCommit,
          "--deny-self-hosted-runners",
        );
      }
      const checksum = await readFile(join(workspace, `${asset}.sha256`), "utf8");
      const lines = checksum.trimEnd().split("\n");
      const archive = await sha256(join(workspace, `${asset}.gz`));
      const binary = lines[1]?.match(/^([0-9a-f]{64}) {2}hamio$/)?.[1];
      if (lines.length !== 2 || lines[0] !== `${archive}  ${asset}.gz` || !binary)
        throw new Error(`Invalid verified checksum for ${target}.`);
      sources[system] = {
        target,
        archive,
        binary,
        checksum: await sha256(join(workspace, `${asset}.sha256`)),
        sbom: await sha256(join(workspace, `${asset}.spdx.json`)),
        notices: await sha256(join(workspace, `${asset}.notices.txt`)),
      };
    }
    const manifest = { version: tag.slice(1), sourceCommit, sources };
    const pending = join(workspace, "release.json");
    await writeFile(pending, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(pending, file);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const tag = process.argv[2];
  if (!tag || process.argv.length !== 3)
    throw new Error("Usage: bun scripts/update-nix-release.ts vX.Y.Z");
  await updateNixRelease(tag, resolve(import.meta.dir, "../nix/release.json"));
  console.log(`Verified ${tag} and updated nix/release.json. Review the diff before committing.`);
}
