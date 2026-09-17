import {
  imageNames,
  previewChanges,
  previewDirectory,
  recordingChanges,
  recordingNames,
  sourceHashes,
} from "./artifacts.ts";

const args = process.argv.slice(2);
if (
  args.some((arg) => arg !== "--recording" && arg !== "--force") ||
  new Set(args).size !== args.length
) {
  throw new Error("Usage: ./scripts/preview.sh [--recording] [--force]");
}
const recording = args.includes("--recording");
const started = performance.now();
const sources = await sourceHashes();
const changes = [
  ...(await previewChanges(".", sources)),
  ...(recording ? await recordingChanges(".", sources) : []),
];
if (args.includes("--force") || changes.length > 0) {
  if (process.env.HAMIO_PREVIEW_SHELL !== "1") {
    const child = Bun.spawn(["./scripts/preview-env.sh", ...args], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    process.exit(await child.exited);
  }
  const { renderPreviews } = await import("./render.ts");
  await renderPreviews(recording);
  console.log(`Preview generated in ${((performance.now() - started) / 1000).toFixed(2)}s.`);
} else {
  console.log("Preview is current; reused verified files. Use --force to capture again.");
}
for (const name of imageNames) console.log(`${previewDirectory}/${name}`);
if (recording) for (const name of recordingNames) console.log(`dist/preview/${name}`);
