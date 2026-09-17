import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  imageHashes,
  imageNames,
  manifestPath,
  previewDirectory,
  sourceHashes,
} from "./artifacts.ts";
import { captureTerminal } from "./capture.ts";
import { scenarios } from "./scenarios.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--recording") || args.length > 1) {
  throw new Error("Usage: ./scripts/preview.sh [--recording]");
}
const fonts = process.env.HAMIO_PREVIEW_FONTS;
if (!fonts) throw new Error("Use ./scripts/preview.sh to load the pinned preview tools.");

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, RAYON_NUM_THREADS: "2" },
    timeout: 60_000,
    killSignal: "SIGKILL",
  });
  if ((await child.exited) !== 0) throw new Error(`${command[0]} failed.`);
}

const agg = [
  "agg",
  "--quiet",
  "--font-dir",
  `${fonts}/share/fonts`,
  "--font-family",
  "JetBrains Mono,Noto Sans Mono CJK JP",
  "--font-size",
  "16",
  "--line-height",
  "1.4",
  "--theme",
  "github-dark",
  "--fps-cap",
  "10",
  "--last-frame-duration",
  "1",
];

await mkdir("dist/preview", { recursive: true });
const temporary = await mkdtemp("dist/preview/render-");
const started = performance.now();
const sources = await sourceHashes();
try {
  for (const scenario of scenarios) {
    const recorded = await captureTerminal(scenario);
    const castPath = join(temporary, `${scenario.name}.cast`);
    await Bun.write(castPath, recorded.cast);
    for (const [name, cast] of recorded.snapshots) {
      const prefix = join(temporary, `${scenario.name}-${name}`);
      await Bun.write(`${prefix}.cast`, cast);
      await run([...agg, "--select", "100%", `${prefix}.cast`, `${prefix}.gif`]);
      await run([
        "python3",
        "-c",
        "from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2])",
        `${prefix}.gif`,
        `${prefix}.png`,
      ]);
    }
    if (args.includes("--recording")) {
      await run([...agg, castPath, join(temporary, `${scenario.name}.gif`)]);
    }
  }
  const images = await imageHashes(temporary);
  if (!Bun.deepEquals(sources, await sourceHashes())) {
    throw new Error("Preview sources changed while rendering. Run the preview again.");
  }
  await mkdir(previewDirectory, { recursive: true });
  for (const name of imageNames) {
    await rename(join(temporary, name), join(previewDirectory, name));
  }
  for (const scenario of scenarios) {
    for (const extension of args.includes("--recording") ? ["cast", "gif"] : ["cast"]) {
      const name = `${scenario.name}.${extension}`;
      await rename(join(temporary, name), join("dist/preview", name));
    }
  }
  await Bun.write(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        description: "Development recording fixtures; not the product UI.",
        environment: { platform: process.platform, arch: process.arch, bun: Bun.version },
        sources,
        images,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Preview generated in ${((performance.now() - started) / 1000).toFixed(2)}s.`);
  for (const name of imageNames) console.log(`${previewDirectory}/${name}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
