import { createHash } from "node:crypto";
import { join } from "node:path";
import { scenarios } from "./scenarios.ts";

export const previewDirectory = "docs/previews";
export const manifestPath = `${previewDirectory}/manifest.json`;
export const recordingManifestPath = "dist/preview/manifest.json";
export const imageNames = scenarios.flatMap((scenario) =>
  scenario.steps.flatMap((step) =>
    step.snapshot ? [`${scenario.name}-${step.snapshot}.png`] : [],
  ),
);
export const recordingNames = scenarios.flatMap(({ name }) => [`${name}.cast`, `${name}.gif`]);
type Hashes = Record<string, string>;

export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sourceHashes(root = ".") {
  const paths = new Set<string>();
  for (const pattern of [
    "scripts/preview/**/*.ts",
    "scripts/preview*.sh",
    "src/**/*",
    "flake.nix",
    "flake.lock",
    "package.json",
    "bun.lock",
  ]) {
    for await (const path of new Bun.Glob(pattern).scan({
      cwd: root,
      onlyFiles: true,
      dot: true,
    })) {
      paths.add(path);
    }
  }
  const hashes: Hashes = {};
  for (const path of [...paths].sort()) {
    hashes[path] = digest(await Bun.file(join(root, path)).bytes());
  }
  return hashes;
}

class InvalidArtifact extends Error {}

export async function imageHashes(directory: string) {
  const hashes: Hashes = {};
  for (const name of imageNames) {
    const file = Bun.file(join(directory, name));
    if (file.size > 512 * 1024) throw new InvalidArtifact(`Oversized preview PNG: ${name}`);
    const bytes = await file.bytes();
    if (!Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new InvalidArtifact(`Invalid preview PNG: ${name}`);
    }
    hashes[name] = digest(bytes);
  }
  return hashes;
}

export async function recordingHashes(directory: string) {
  const hashes: Hashes = {};
  for (const name of recordingNames) {
    const file = Bun.file(join(directory, name));
    if (file.size > 16 * 1024 * 1024) throw new InvalidArtifact(`Oversized recording: ${name}`);
    hashes[name] = digest(await file.bytes());
  }
  return hashes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canRegenerate(error: unknown) {
  return (
    error instanceof SyntaxError ||
    error instanceof InvalidArtifact ||
    (isRecord(error) && error.code === "ENOENT")
  );
}

function changedPaths(recorded: unknown, current: Hashes, prefix = "") {
  if (!isRecord(recorded)) return Object.keys(current).map((path) => prefix + path);
  return [...new Set([...Object.keys(recorded), ...Object.keys(current)])]
    .filter((path) => recorded[path] !== current[path])
    .sort()
    .map((path) => prefix + path);
}

export async function previewChanges(root = ".", sources?: Hashes): Promise<string[]> {
  try {
    const manifest: unknown = await Bun.file(join(root, manifestPath)).json();
    if (!isRecord(manifest) || manifest.schemaVersion !== 1) return [manifestPath];
    return [
      ...changedPaths(manifest.sources, sources ?? (await sourceHashes(root))),
      ...changedPaths(
        manifest.images,
        await imageHashes(join(root, previewDirectory)),
        `${previewDirectory}/`,
      ),
    ];
  } catch (error) {
    if (!canRegenerate(error)) throw error;
    return [error instanceof Error ? error.message : "Missing preview files"];
  }
}

export async function recordingChanges(root = ".", sources?: Hashes): Promise<string[]> {
  try {
    const manifest: unknown = await Bun.file(join(root, recordingManifestPath)).json();
    if (!isRecord(manifest) || manifest.schemaVersion !== 1) return [recordingManifestPath];
    return [
      ...changedPaths(manifest.sources, sources ?? (await sourceHashes(root))),
      ...changedPaths(
        manifest.recordings,
        await recordingHashes(join(root, "dist/preview")),
        "dist/preview/",
      ),
    ];
  } catch (error) {
    if (!canRegenerate(error)) throw error;
    return [error instanceof Error ? error.message : "Missing recordings"];
  }
}

export async function checkPreviews(root = ".") {
  const changes = await previewChanges(root);
  if (changes.length > 0) {
    const listed = changes
      .slice(0, 10)
      .map((path) => `  ${path}`)
      .join("\n");
    const remaining = changes.length > 10 ? `\n  …and ${changes.length - 10} more` : "";
    throw new Error(
      `Terminal previews are stale:\n${listed}${remaining}\nRun ./scripts/preview.sh and inspect the PNGs.`,
    );
  }
}
