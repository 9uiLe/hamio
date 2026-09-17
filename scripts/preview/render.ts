import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  imageHashes,
  imageNames,
  manifestPath,
  previewDirectory,
  recordingHashes,
  recordingManifestPath,
  recordingNames,
  sourceHashes,
} from "./artifacts.ts";
import { captureTerminal } from "./capture.ts";
import { scenarios } from "./scenarios.ts";

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

export async function renderPreviews(recording: boolean) {
  const fonts = process.env.HAMIO_PREVIEW_FONTS;
  if (!fonts) throw new Error("Use ./scripts/preview.sh to load the pinned preview tools.");
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
  const sources = await sourceHashes();
  try {
    const conversions: string[] = [];
    for (const scenario of scenarios) {
      const captured = await captureTerminal({ ...scenario, holdMs: recording ? 500 : 0 });
      const castPath = join(temporary, `${scenario.name}.cast`);
      await Bun.write(castPath, captured.cast);
      for (const [name, event] of captured.snapshots) {
        const prefix = join(temporary, `${scenario.name}-${name}`);
        // Exact event selection avoids percentage rounding and duplicate cast prefixes.
        await run([...agg, "--select", `event:${event}`, castPath, `${prefix}.gif`]);
        conversions.push(prefix);
      }
      if (recording) await run([...agg, castPath, join(temporary, `${scenario.name}.gif`)]);
    }
    // Keep renderers sequential; share one Pillow process without multiplying font heaps.
    await run([
      "python3",
      "-c",
      "from PIL import Image; import sys\nfor prefix in sys.argv[1:]:\n with Image.open(prefix + '.gif') as image: image.save(prefix + '.png')",
      ...conversions,
    ]);
    const images = await imageHashes(temporary);
    const recordings = recording ? await recordingHashes(temporary) : undefined;
    if (!Bun.deepEquals(sources, await sourceHashes())) {
      throw new Error("Preview sources changed while rendering. Run the preview again.");
    }
    await mkdir(previewDirectory, { recursive: true });
    for (const name of imageNames)
      await rename(join(temporary, name), join(previewDirectory, name));
    const files = recording ? recordingNames : scenarios.map(({ name }) => `${name}.cast`);
    for (const name of files) await rename(join(temporary, name), join("dist/preview", name));
    const manifest = {
      schemaVersion: 1,
      description: "Development recording fixtures; not the product UI.",
      environment: { platform: process.platform, arch: process.arch, bun: Bun.version },
      sources,
      images,
    };
    await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (recordings) {
      await Bun.write(
        recordingManifestPath,
        `${JSON.stringify({ schemaVersion: 1, sources, recordings }, null, 2)}\n`,
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
