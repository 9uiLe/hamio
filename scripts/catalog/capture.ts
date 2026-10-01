import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { digest } from "../preview/artifacts.ts";
import { captureTerminal } from "../preview/capture.ts";
import { captureSource, captures, directory, manifestPath } from "./artifacts.ts";

if (!process.env.HAMIO_PREVIEW_FONTS)
  throw new Error(
    "Use nix develop .#preview --command bun scripts/catalog/capture.ts for pinned capture tools.",
  );

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, RAYON_NUM_THREADS: "2" },
    timeout: 60_000,
    killSignal: "SIGKILL",
  });
  if ((await child.exited) !== 0) throw new Error(`${command[0]} failed.`);
}

await mkdir(directory, { recursive: true });
await mkdir("dist", { recursive: true });
const temporary = await mkdtemp("dist/catalog-capture-");
const entries: Record<string, { sources: Record<string, string>; image: string }> = {};
try {
  for (const capture of captures) {
    const sources = await captureSource(capture);
    const captured = await captureTerminal({
      command: [
        process.execPath,
        "--no-env-file",
        "--no-install",
        "scripts/catalog/terminal-runner.ts",
        capture.id,
        String(capture.columns),
      ],
      cols: capture.columns,
      rows: capture.rows,
      steps: [
        {
          waitFor:
            capture.id === "run-group-mixed"
              ? "Task Package (b) — succeeded; no data"
              : capture.id === "task-running-partial"
                ? "running; progress determinate 2/4"
                : "Name: short | Value: null",
          snapshot: "state",
        },
      ],
      holdMs: 0,
    });
    const cast = join(temporary, `${capture.id}.cast`);
    const gif = join(temporary, `${capture.id}.gif`);
    const png = join(temporary, `${capture.id}.png`);
    await Bun.write(cast, captured.cast);
    const event = captured.snapshots.get("state");
    if (event === undefined)
      throw new Error(`Capture ${capture.id} did not reach its expected state.`);
    await run([
      "agg",
      "--quiet",
      "--font-dir",
      `${process.env.HAMIO_PREVIEW_FONTS}/share/fonts`,
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
      "--select",
      `event:${event}`,
      cast,
      gif,
    ]);
    await run([
      "python3",
      "-c",
      "from PIL import Image; import sys\nwith Image.open(sys.argv[1]) as image: image.save(sys.argv[2])",
      gif,
      png,
    ]);
    const bytes = await Bun.file(png).bytes();
    entries[capture.id] = { sources, image: digest(bytes) };
    await rename(png, join(directory, `${capture.id}.png`));
  }
  await Bun.write(
    manifestPath,
    `${JSON.stringify({ schemaVersion: 1, captures: entries }, null, 2)}\n`,
  );
  console.log(
    `Generated ${captures.length} actual PTY captures in ${directory}. Open the PNGs and inspect their content.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
