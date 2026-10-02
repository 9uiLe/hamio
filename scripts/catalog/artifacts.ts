import { join } from "node:path";
import { createHash } from "node:crypto";

export function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
import { resolveScenario, scenarioById } from "./scenarios.ts";

export const captures = [
  { id: "task-running-partial", columns: 40, rows: 18 },
  { id: "run-group-mixed", columns: 80, rows: 20 },
  { id: "table-narrow-long-redacted", columns: 40, rows: 25 },
] as const;

export const directory = "docs/catalog-previews";
export const manifestPath = `${directory}/manifest.json`;

const sources = [
  "scripts/catalog/terminal-runner.ts",
  "scripts/catalog/capture.ts",
  "scripts/catalog/artifacts.ts",
  "scripts/terminal-capture/capture.ts",
  "src/renderers/terminal.ts",
  "src/renderers/terminal-live.ts",
  "src/terminal/text.ts",
  "flake.nix",
  "flake.lock",
];

export async function captureSource(capture: (typeof captures)[number]) {
  const hashes: Record<string, string> = {};
  for (const path of sources) hashes[path] = digest(await Bun.file(path).bytes());
  hashes["resolved-state"] = digest(
    new TextEncoder().encode(JSON.stringify(resolveScenario(scenarioById(capture.id)))),
  );
  hashes["columns-rows"] = digest(new TextEncoder().encode(`${capture.columns}x${capture.rows}`));
  return hashes;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function checkCaptureArtifacts(): Promise<void> {
  let manifest: unknown;
  try {
    manifest = await Bun.file(manifestPath).json();
  } catch {
    throw new Error(
      `Catalog captures are missing. Run nix develop .#preview --command bun scripts/catalog/capture.ts`,
    );
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !Object.hasOwn(manifest, "captures") ||
    !Object.hasOwn(manifest, "schemaVersion") ||
    (manifest as { schemaVersion: unknown }).schemaVersion !== 1
  )
    throw new Error(`Catalog capture manifest is invalid: ${manifestPath}`);
  const entries = (manifest as { captures: Record<string, { sources: unknown; image: string }> })
    .captures;
  for (const capture of captures) {
    const entry = entries[capture.id];
    if (!entry || !equal(entry.sources, await captureSource(capture)))
      throw new Error(
        `Catalog capture ${capture.id} is stale. Run nix develop .#preview --command bun scripts/catalog/capture.ts`,
      );
    const file = Bun.file(join(directory, `${capture.id}.png`));
    if (!(await file.exists()))
      throw new Error(
        `Catalog capture ${capture.id} is missing. Run nix develop .#preview --command bun scripts/catalog/capture.ts`,
      );
    if (file.size > 512 * 1024) throw new Error(`Catalog capture ${capture.id} exceeds 512 KiB.`);
    const bytes = await file.bytes();
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => bytes[index] === value) || digest(bytes) !== entry.image)
      throw new Error(`Catalog capture ${capture.id} is missing or altered.`);
  }
}
