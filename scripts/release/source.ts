import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { run } from "./process.ts";

export interface Source {
  readonly commit: string;
  readonly modified: boolean;
  readonly epoch: string;
  readonly created: string;
  readonly version: string;
  readonly license: string;
  readonly digest: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

const inputs = [
  "package.json",
  "bun.lock",
  "flake.nix",
  "flake.lock",
  "tsconfig.json",
  "LICENSE",
  "src",
  "scripts/build.ts",
  "scripts/build",
  "scripts/release",
  "scripts/install.sh",
  ".github/workflows/release.yml",
];

/** Captures build inputs by content, including uncommitted changes, without copying Git or dist. */
export async function captureSource(root: string): Promise<Source> {
  const files = new Map<string, Uint8Array>();
  async function visit(path: string): Promise<void> {
    const absolute = join(root, path);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Build inputs must not be symlinks: ${path}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(`${path}/${name}`);
    } else if (info.isFile()) files.set(path, await readFile(absolute));
    else throw new Error(`Unsupported build input: ${path}`);
  }
  for (const path of inputs) await visit(path);
  const commit = await run(["git", "rev-parse", "HEAD"], root);
  const epoch = await run(["git", "show", "-s", "--format=%ct", commit], root);
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^\d{1,11}$/.test(epoch))
    throw new Error("Cannot resolve source identity and timestamp.");
  const modified = (await run(["git", "status", "--porcelain"], root)) !== "";
  const manifest = files.get("package.json");
  if (!manifest) throw new Error("Missing package.json.");
  const pkg: unknown = JSON.parse(new TextDecoder().decode(manifest));
  if (
    !pkg ||
    typeof pkg !== "object" ||
    !("version" in pkg) ||
    typeof pkg.version !== "string" ||
    !("license" in pkg) ||
    typeof pkg.license !== "string" ||
    pkg.license.trim() === "" ||
    pkg.license === "UNLICENSED"
  )
    throw new Error("Package version and license are required.");
  const hashes = [...files]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")]);
  return {
    commit,
    modified,
    epoch,
    created: new Date(Number(epoch) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    version: pkg.version,
    license: pkg.license,
    digest: createHash("sha256").update(JSON.stringify(hashes)).digest("hex"),
    files,
  };
}

export async function writeSource(source: Source, destination: string): Promise<void> {
  for (const [path, bytes] of source.files) {
    const file = join(destination, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
}

export async function assertSourceUnchanged(root: string, expected: Source): Promise<void> {
  const actual = await captureSource(root);
  if (
    actual.digest !== expected.digest ||
    actual.commit !== expected.commit ||
    actual.modified !== expected.modified
  )
    throw new Error("Source changed while building release assets.");
}
