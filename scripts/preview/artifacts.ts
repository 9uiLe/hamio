import { createHash } from "node:crypto";
import { join } from "node:path";
import { scenarios } from "./scenarios.ts";

export const previewDirectory = "docs/previews";
export const manifestPath = `${previewDirectory}/manifest.json`;
export const imageNames = scenarios.flatMap((scenario) =>
  scenario.steps.flatMap((step) =>
    step.snapshot ? [`${scenario.name}-${step.snapshot}.png`] : [],
  ),
);

export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sourceHashes(root = ".") {
  const paths = new Set<string>();
  for (const pattern of [
    "scripts/preview/**/*.ts",
    "scripts/preview.sh",
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
  const hashes: Record<string, string> = {};
  for (const path of [...paths].sort()) {
    hashes[path] = digest(await Bun.file(join(root, path)).bytes());
  }
  return hashes;
}

export async function imageHashes(directory: string) {
  const hashes: Record<string, string> = {};
  for (const name of imageNames) {
    const bytes = await Bun.file(`${directory}/${name}`).bytes();
    if (
      bytes.length > 512 * 1024 ||
      !Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      throw new Error(`Invalid or oversized preview PNG: ${name}`);
    }
    hashes[name] = digest(bytes);
  }
  return hashes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function checkPreviews(root = ".") {
  const manifest: unknown = await Bun.file(join(root, manifestPath)).json();
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 1 ||
    !Bun.deepEquals(manifest.sources, await sourceHashes(root)) ||
    !Bun.deepEquals(manifest.images, await imageHashes(join(root, previewDirectory)))
  ) {
    throw new Error("Terminal previews are stale. Run ./scripts/preview.sh and inspect the PNGs.");
  }
}
